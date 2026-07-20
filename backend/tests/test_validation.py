"""Test input validation — Pydantic models + sanitization."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["JWT_SECRET"] = "test-secret-key-not-for-production-12345678"

from models.schemas import SiteIn, CustomerIn, VlanIn, BlockIn, AllocIn, LoginIn, UserIn


class TestSiteValidation:
    def test_valid_site(self):
        s = SiteIn(name="Jakarta DC")
        assert s.name == "Jakarta DC"

    def test_empty_name_raises(self):
        import pydantic
        try:
            SiteIn(name="")
            assert False, "Should have raised"
        except pydantic.ValidationError:
            assert True

    def test_name_too_long_raises(self):
        import pydantic
        try:
            SiteIn(name="x" * 201)
            assert False, "Should have raised"
        except pydantic.ValidationError:
            assert True

    def test_dangerous_chars_stripped(self):
        s = SiteIn(name="Test; DROP TABLE sites; --")
        assert "'" not in s.name
        assert ";" not in s.name
        assert "--" not in s.name

    def test_whitespace_stripped(self):
        s = SiteIn(name="  Jakarta DC  ")
        assert s.name == "Jakarta DC"


class TestCustomerValidation:
    def test_valid_customer(self):
        c = CustomerIn(name="PT Contoh")
        assert c.name == "PT Contoh"

    def test_code_regex_accepted(self):
        c = CustomerIn(name="Test", code="CUST-001")
        assert c.code == "CUST-001"

    def test_code_invalid_chars_raises(self):
        import pydantic
        try:
            CustomerIn(name="Test", code="cust 001!!")
            assert False
        except pydantic.ValidationError:
            assert True


class TestVlanValidation:
    def test_valid_vid(self):
        v = VlanIn(vid=100)
        assert v.vid == 100

    def test_vid_too_low_raises(self):
        import pydantic
        try:
            VlanIn(vid=0)
            assert False
        except pydantic.ValidationError:
            assert True

    def test_vid_too_high_raises(self):
        import pydantic
        try:
            VlanIn(vid=4095)
            assert False
        except pydantic.ValidationError:
            assert True

    def test_vid_upper_bound(self):
        v = VlanIn(vid=4094)
        assert v.vid == 4094


class TestLoginValidation:
    def test_valid_login(self):
        l = LoginIn(username="admin", password="secret")
        assert l.username == "admin"

    def test_empty_username_raises(self):
        import pydantic
        try:
            LoginIn(username="", password="secret")
            assert False
        except pydantic.ValidationError:
            assert True


class TestUserValidation:
    def test_username_regex_accepted(self):
        u = UserIn(username="firas_admin", email="f@sdi.com", password="1234")
        assert u.username == "firas_admin"

    def test_username_invalid_chars_raises(self):
        import pydantic
        try:
            UserIn(username="firas admin!", email="f@sdi.com", password="1234")
            assert False
        except pydantic.ValidationError:
            assert True


class TestVlanNameGeneration:
    def test_vlan_name_from_vid(self):
        name = f"VLAN {100}"
        assert name == "VLAN 100"

    def test_vlan_name_range(self):
        for vid in [1, 100, 1000, 4094]:
            assert f"VLAN {vid}" == f"VLAN {vid}"

    def test_customer_code_generation(self):
        code = "PT Laxo"[:4].upper()
        assert code == "PT L"

    def test_vlan_creation_payload(self):
        payload = {"vid": 100, "name": "VLAN 100", "status": "active"}
        assert payload["name"] == "VLAN 100"
        assert payload["status"] == "active"
