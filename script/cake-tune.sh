#!/bin/sh
# CAKE tuning script - GL-MT6000 (secondwan)
# Configuracion via UCI: /etc/config/cake_secondwan

UCI="cake_secondwan"
WAN=$(uci -q get ${UCI}.global.wan_iface || echo "lan1")
IFB=$(uci -q get ${UCI}.global.ifb_iface || echo "ifb-lan1")
UPLINK=$(uci -q get ${UCI}.global.uplink || echo "190Mbit")
DOWNLINK=$(uci -q get ${UCI}.global.downlink || echo "190Mbit")
RTT=$(uci -q get ${UCI}.global.rtt || echo "20ms")
OVERHEAD=$(uci -q get ${UCI}.global.overhead || echo "18")

logger -t cake "Configuracion: WAN=$WAN IFB=$IFB UP=$UPLINK DN=$DOWNLINK RTT=$RTT OH=$OVERHEAD"

### IFB SETUP ###
if ! ip link show "$IFB" > /dev/null 2>&1; then
    ip link add "$IFB" type ifb
    ip link set "$IFB" up
    logger -t cake "IFB $IFB creado"
fi

tc qdisc add dev "$WAN" ingress 2>/dev/null

tc filter show dev "$WAN" ingress 2>/dev/null | grep -q ifb || \
    tc filter add dev "$WAN" ingress matchall \
        action ctinfo dscp 0x3f 0x80 \
        action mirred egress redirect dev "$IFB"

### EGRESS (UPLOAD) ###
tc qdisc replace dev "$WAN" root cake \
    bandwidth $UPLINK \
    diffserv4 \
    dual-srchost \
    nat wash \
    ack-filter \
    split-gso \
    rtt $RTT \
    overhead $OVERHEAD \
    noatm

### INGRESS (DOWNLOAD) ###
tc qdisc replace dev "$IFB" root cake \
    bandwidth $DOWNLINK \
    diffserv4 \
    dual-dsthost \
    nat wash \
    ingress \
    no-ack-filter \
    split-gso \
    rtt $RTT \
    overhead $OVERHEAD \
    noatm

logger -t cake "CAKE aplicado: $WAN egress $UPLINK / $IFB ingress $DOWNLINK"
