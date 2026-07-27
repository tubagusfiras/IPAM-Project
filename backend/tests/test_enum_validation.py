"""Test enum validation - owner_type & status fields against DB enum values.

These tests exist because of a real incident: the frontend sent owner_type="infrastructure"
and status="inactive" which are not valid PostgreSQL enum values, causing 500 errors instead
of clean validation errors. These tests ensure Pydantic rejects invalid enum values at the
API boundary rather than letting them reach the database.
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["JWT_SECRET"] = "test-secret-key-not-for-production-12345678"

import pydantic
from models.schemas import AllocIn, VlanIn, BlockIn


class TestAllocOwnerTypeValidation:
    def test_valid_owner_types_accepted(self):
        for ot in ["customer", "internal", "ptp", "peering", "management", "reserved"]:
            a = AllocIn(prefix="10.0.0.0/30", block_id="x", owner_type=ot)
            assert a.owner_type == ot

    def test_infrastructure_rejected(self):
        # Regression test: this exact value caused a production 500 error
        try:
            AllocIn(prefix="10.0.0.0/30", block_id="x", owner_type="infrastructure")
            assert False, "Should have raised ValidationError"
        except pydantic.ValidationError:
            assert True

    def test_arbitrary_string_rejected(self):
        try:
            AllocIn(prefix="10.0.0.0/30", block_id="x", owner_type="not_a_real_type")
            assert False, "Should have raised ValidationError"
        except pydantic.ValidationError:
            assert True

    def test_default_owner_type_is_customer(self):
        a = AllocIn(prefix="10.0.0.0/30", block_id="x")
        assert a.owner_type == "customer"


class TestAllocStatusValidation:
    def test_valid_statuses_accepted(self):
        for s in ["active", "reserved", "available", "deprecated"]:
            a = AllocIn(prefix="10.0.0.0/30", block_id="x", status=s)
            assert a.status == s

    def test_invalid_status_rejected(self):
        try:
            AllocIn(prefix="10.0.0.0/30", block_id="x", status="pending")
            assert False, "Should have raised ValidationError"
        except pydantic.ValidationError:
            assert True


class TestVlanStatusValidation:
    def test_valid_statuses_accepted(self):
        for s in ["active", "reserved", "deprecated"]:
            v = VlanIn(vid=100, status=s)
            assert v.status == s

    def test_inactive_rejected(self):
        # Regression test: this exact value existed in the frontend dropdown
        # and would have caused a 500 error if selected and saved
        try:
            VlanIn(vid=100, status="inactive")
            assert False, "Should have raised ValidationError"
        except pydantic.ValidationError:
            assert True

    def test_default_status_is_active(self):
        v = VlanIn(vid=100)
        assert v.status == "active"


class TestBlockStatusValidation:
    def test_valid_statuses_accepted(self):
        for s in ["active", "reserved", "deprecated", "available"]:
            b = BlockIn(prefix="10.0.0.0/24", status=s)
            assert b.status == s

    def test_invalid_status_rejected(self):
        try:
            BlockIn(prefix="10.0.0.0/24", status="inactive")
            assert False, "Should have raised ValidationError"
        except pydantic.ValidationError:
            assert True
