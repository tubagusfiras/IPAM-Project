"""Test CSV parser — validasi parsing format IPv4 & IPv6."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Import parser functions from services module
from services.csv_parser import parse_ipv4_csv, parse_ipv6_csv, to_plen


# ── SAMPLE DATA ────────────────────────────────────────────
SAMPLE_IPV4_ASIANA = """163.61.201.0/24 | 153816,,,,,,,,,,,,,,,
Mask (Dec) :,,0.252,,0.248,,0.24,,0.224,,0.192,,0.128,,0,
,,/30,,/29,,/28,,/27,,/26,,/25,,/24,
,,2,,3,,4,,5,,6,,7,,8,
Alokasi,Vlan,Network,Broadcast,Network,Broadcast,Network,Broadcast,Network,Broadcast,Network,Broadcast,Network,Broadcast,Network,Broadcast
SERVER PUBLIK RK 15,,0,3,0,,0,,0,,0,,0,,0,
,,4,7,,7,,,,,,,,,,
Server OPUNG KE JKT,662,8,11,8,,,,,,,,,,,
,,12,15,,15,,15,,,,,,,,
PTP BOB,2077,16,19,16,,16,,,,,,,,,
,,20,23,,23,,,,,,,,,,
"""

SAMPLE_IPV6 = """,,
,2404:fd00:36::/48  - LS ZETTA Connect Plus,
,,
,2404:fd00:36::0/127,equinix
,2404:fd00:36::1/127,equinix
,2404:fd00:36::2/127,MRO-Equinix
,2404:fd00:36::3/127,MRO-Equinix
,2404:fd00:36::4/127,ls-google-pe1
,2404:fd00:36::5/127,ls-google-pe1
,2404:fd00:36::14/127(SDI),Cipta-TP-AS153646
,2404:fd00:36::15/127(CTP),Cipta-TP-AS153646
"""


# ── TESTS ──────────────────────────────────────────────────
class TestToPlen:
    def test_slash30(self):
        assert to_plen(4) == 30

    def test_slash29(self):
        assert to_plen(8) == 29

    def test_slash28(self):
        assert to_plen(16) == 28

    def test_slash27(self):
        assert to_plen(32) == 27

    def test_slash26(self):
        assert to_plen(64) == 26

    def test_slash25(self):
        assert to_plen(128) == 25

    def test_slash24(self):
        assert to_plen(256) == 24

    def test_zero_size(self):
        assert to_plen(0) == 30  # default fallback


class TestParseIPv4:
    def test_metadata_asn(self):
        meta, allocs = parse_ipv4_csv(SAMPLE_IPV4_ASIANA)
        assert meta["asn"] == "153816"

    def test_metadata_prefix(self):
        meta, allocs = parse_ipv4_csv(SAMPLE_IPV4_ASIANA)
        assert meta["prefix"] == "163.61.201.0/24"

    def test_has_allocations(self):
        meta, allocs = parse_ipv4_csv(SAMPLE_IPV4_ASIANA)
        assert len(allocs) > 0

    def test_first_allocation_prefix(self):
        meta, allocs = parse_ipv4_csv(SAMPLE_IPV4_ASIANA)
        first = allocs[0]
        assert first["prefix"].startswith("163.61.201")
        assert "/" in first["prefix"]

    def test_customer_name(self):
        meta, allocs = parse_ipv4_csv(SAMPLE_IPV4_ASIANA)
        assert allocs[0]["customer"] == "SERVER PUBLIK RK 15"

    def test_vlan_extracted(self):
        meta, allocs = parse_ipv4_csv(SAMPLE_IPV4_ASIANA)
        # Server OPUNG KE JKT at index 1, has VLAN 662
        server_alloc = [a for a in allocs if a.get("customer") == "Server OPUNG KE JKT"]
        assert len(server_alloc) > 0
        assert server_alloc[0]["vlan"] == 662


class TestParseIPv6:
    def test_metadata_prefix(self):
        meta, allocs = parse_ipv6_csv(SAMPLE_IPV6)
        assert meta["prefix"] == "2404:fd00:36::/48"

    def test_has_allocations(self):
        meta, allocs = parse_ipv6_csv(SAMPLE_IPV6)
        assert len(allocs) > 0

    def test_first_customer(self):
        meta, allocs = parse_ipv6_csv(SAMPLE_IPV6)
        assert allocs[0]["customer"] == "equinix"

    def test_side_indicator_parsed(self):
        meta, allocs = parse_ipv6_csv(SAMPLE_IPV6)
        sdi_alloc = [a for a in allocs if "SDI" in (a.get("notes") or "")]
        assert len(sdi_alloc) > 0

    def test_prefix_format(self):
        meta, allocs = parse_ipv6_csv(SAMPLE_IPV6)
        first = allocs[0]
        assert "::" in first["prefix"]
        assert "/127" in first["prefix"]

    def test_empty_input(self):
        meta, allocs = parse_ipv6_csv("")
        assert meta == {"asn": None, "router": None, "operator": None, "prefix": None, "name": None}
        assert allocs == []
