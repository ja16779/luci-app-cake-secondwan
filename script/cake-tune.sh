#!/bin/sh
# CAKE tuning script - GL-MT6000 (secondwan / Megacable)
# Egress: lan1 | Ingress: ifb-lan1

UPLINK="190Mbit"
DOWNLINK="190Mbit"
RTT="20ms"
OVERHEAD="18"
WAN="lan1"
IFB="ifb-lan1"

### IFB SETUP (crear y redirigir si no existe) ###
if ! ip link show "$IFB" > /dev/null 2>&1; then
    ip link add "$IFB" type ifb
    ip link set "$IFB" up
    logger -t cake "IFB $IFB creado"
fi

# Ingress qdisc en WAN (necesario para redirigir a IFB)
tc qdisc add dev "$WAN" ingress 2>/dev/null

# Redirigir ingress de WAN al IFB (solo si no existe el filtro)
tc filter show dev "$WAN" ingress 2>/dev/null | grep -q ifb ||     tc filter add dev "$WAN" ingress matchall         action ctinfo dscp 0x3f 0x80         action mirred egress redirect dev "$IFB"

### EGRESS (UPLOAD) ###
tc qdisc replace dev "$WAN" root cake     bandwidth $UPLINK     diffserv4     dual-srchost     nat wash     ack-filter     split-gso     rtt $RTT     overhead $OVERHEAD     noatm

### INGRESS (DOWNLOAD) ###
tc qdisc replace dev "$IFB" root cake     bandwidth $DOWNLINK     diffserv4     dual-dsthost     nat wash     ingress     no-ack-filter     split-gso     rtt $RTT     overhead $OVERHEAD     noatm

logger -t cake "CAKE aplicado: $WAN egress $UPLINK / ingress $DOWNLINK"
