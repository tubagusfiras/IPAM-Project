from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from models.schemas import CustomerIn
from core.database import get_db

router = APIRouter(tags=["Customers"])

@router.get("/api/v1/customers")
async def list_customers(
    search: Optional[str]=Query(None),
    source: Optional[str]=Query(None, description="Filter by source: static or dynamic"),
    limit: int=Query(50,ge=1,le=500),
    offset: int=Query(0,ge=0),
    db=Depends(get_db)
):
    q = f"%{search}%" if search else "%"
    conditions = ["(c.name ILIKE $1 OR c.code ILIKE $1)"]
    params = [q]
    if source:
        params.append(source)
        conditions.append(f"c.source = ${len(params)}")
    where = " AND ".join(conditions)
    params.extend([limit, offset])
    rows = await db.fetch(f"""
        SELECT c.*, COUNT(DISTINCT a.id) AS alloc_count
        FROM customers c
        LEFT JOIN allocations a ON a.customer_id = c.id
        WHERE {where}
        GROUP BY c.id ORDER BY c.name
        LIMIT ${len(params)-1} OFFSET ${len(params)}
    """, *params)
    total = await db.fetchval(f"SELECT COUNT(*) FROM customers c WHERE {where}", *params[:-2])
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
        "INSERT INTO customers (name,code,contact_name,contact_email,contact_phone,description,is_active,source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        body.name, body.code, body.contact_name, body.contact_email, body.contact_phone, body.description, body.is_active, body.source or "dynamic"
    )
    return dict(row)

@router.put("/api/v1/customers/{customer_id}")
async def update_customer(customer_id: str, body: CustomerIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE customers SET name=$1,code=$2,contact_name=$3,contact_email=$4,contact_phone=$5,description=$6,is_active=$7,source=$8 WHERE id=$9::uuid RETURNING *",
        body.name, body.code, body.contact_name, body.contact_email, body.contact_phone, body.description, body.is_active, body.source or "dynamic", customer_id
    )
    if not row: raise HTTPException(404, "Customer not found")
    return dict(row)

@router.delete("/api/v1/customers/{customer_id}", status_code=204)
async def delete_customer(customer_id: str, db=Depends(get_db)):
    await db.execute("DELETE FROM customers WHERE id=$1::uuid", customer_id)
