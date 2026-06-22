from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from models.schemas import CustomerIn
from core.database import get_db

router = APIRouter(tags=["Customers"])

@router.get("/api/v1/customers")
async def list_customers(
    search: Optional[str]=Query(None),
    limit: int=Query(50,ge=1,le=500),
    offset: int=Query(0,ge=0),
    db=Depends(get_db)
):
    q = f"%{search}%" if search else "%"
    rows = await db.fetch("""
        SELECT c.*, COUNT(DISTINCT a.id) AS alloc_count
        FROM customers c
        LEFT JOIN allocations a ON a.customer_id = c.id
        WHERE c.name ILIKE $1 OR c.code ILIKE $1
        GROUP BY c.id ORDER BY c.name
        LIMIT $2 OFFSET $3
    """, q, limit, offset)
    total = await db.fetchval("SELECT COUNT(*) FROM customers WHERE name ILIKE $1 OR code ILIKE $1", q)
    return {"total": total, "items": [dict(r) for r in rows]}

@router.get("/api/v1/customers/{customer_id}")
async def get_customer(customer_id: str, db=Depends(get_db)):
    row = await db.fetchrow("SELECT * FROM customers WHERE id=$1::uuid", customer_id)
    if not row: raise HTTPException(404, "Customer not found")
    allocs = await db.fetch("SELECT * FROM v_allocation_detail WHERE customer_id=$1::uuid ORDER BY prefix::inet", customer_id)
    return {**dict(row), "allocations": [dict(a) for a in allocs]}

@router.post("/api/v1/customers", status_code=201)
async def create_customer(body: CustomerIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "INSERT INTO customers (name,code,contact_name,contact_email,contact_phone,description,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        body.name, body.code, body.contact_name, body.contact_email, body.contact_phone, body.description, body.is_active
    )
    return dict(row)

@router.put("/api/v1/customers/{customer_id}")
async def update_customer(customer_id: str, body: CustomerIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE customers SET name=$1,code=$2,contact_name=$3,contact_email=$4,contact_phone=$5,description=$6,is_active=$7 WHERE id=$8::uuid RETURNING *",
        body.name, body.code, body.contact_name, body.contact_email, body.contact_phone, body.description, body.is_active, customer_id
    )
    if not row: raise HTTPException(404, "Customer not found")
    return dict(row)

@router.delete("/api/v1/customers/{customer_id}", status_code=204)
async def delete_customer(customer_id: str, db=Depends(get_db)):
    await db.execute("DELETE FROM customers WHERE id=$1::uuid", customer_id)
