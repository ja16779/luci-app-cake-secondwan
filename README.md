# luci-app-cake-secondwan

LuCI dashboard for CAKE QoS on a second WAN interface (secondwan) for OpenWrt 25.12.

Displays real-time statistics with live charts and per-tin breakdown, similar to qosmate's statistics view.

## Instalación rápida

```sh
wget -qO /tmp/install.sh https://raw.githubusercontent.com/ja16779/luci-app-cake-secondwan/master/install.sh
sh /tmp/install.sh
```

Luego configura tu interfaz en **Network → CAKE Secondwan → Settings**.

## Screenshot

> Network → CAKE Secondwan

The dashboard shows — for both **Egress (lan1)** and **Ingress (ifb-lan1)**:

- **Summary table**: bandwidth, bytes sent, drops, overlimits, memory usage, overhead, NAT, wash
- **Live line charts** (canvas, 5-minute rolling history):
  - Average delay (ms)
  - Throughput (Mbit/s)
- **Bar charts** per tin (Bulk / Best Effort / Video / Voice):
  - Avg Delay · Peak Delay · Drops · ECN Marks · Packets
- **Detail table** per tin: threshold rate, peak/avg/sparse delay, drops, ECN marks, packets

Refreshes every 5 seconds. History accumulates in-memory (60 samples × 5 s = 5 min).

## Requirements

- OpenWrt 25.12+ (tested on GL-MT6000 / Flint-2, kernel 6.12, aarch64)
- CAKE qdisc applied on `lan1` (egress) and `ifb-lan1` (ingress)
- LuCI with `rpcd` and `fs` module
- IFB device for ingress shaping (created by `cake-tune.sh`)

## File layout

```
/etc/config/cake_secondwan                                     ← UCI configuration
/www/luci-static/resources/view/cake_secondwan/statistics.js   ← LuCI statistics view
/www/luci-static/resources/view/cake_secondwan/settings.js     ← LuCI settings view
/usr/share/luci/menu.d/luci-app-cake-secondwan.json            ← menu entry
/usr/share/rpcd/acl.d/luci-app-cake-secondwan.json             ← rpcd ACL
/etc/init.d/cake                                               ← init script
/etc/hotplug.d/iface/99-cake                                   ← hotplug trigger
/etc/script/cake-tune.sh                                       ← CAKE tuning script
```

## Installation

### 1. Instalación automática (recomendado)

```sh
wget -qO /tmp/install.sh https://raw.githubusercontent.com/ja16779/luci-app-cake-secondwan/master/install.sh
sh /tmp/install.sh
```

El script descarga todos los archivos, activa el servicio, actualiza `sysupgrade.conf` y aplica CAKE.

### 2. Instalación manual

```sh
# UCI config
cp config/cake_secondwan /etc/config/cake_secondwan

# LuCI views
mkdir -p /www/luci-static/resources/view/cake_secondwan
cp luci/statistics.js /www/luci-static/resources/view/cake_secondwan/statistics.js
cp luci/settings.js   /www/luci-static/resources/view/cake_secondwan/settings.js

# Menu entry
cp luci/menu.json /usr/share/luci/menu.d/luci-app-cake-secondwan.json

# rpcd ACL
cp rpcd/acl.json /usr/share/rpcd/acl.d/luci-app-cake-secondwan.json

# Init script
cp init.d/cake /etc/init.d/cake
chmod +x /etc/init.d/cake
/etc/init.d/cake enable

# Hotplug
cp hotplug/99-cake /etc/hotplug.d/iface/99-cake

# CAKE tuning script
mkdir -p /etc/script
cp script/cake-tune.sh /etc/script/cake-tune.sh
chmod +x /etc/script/cake-tune.sh
```

### 2. Configure via LuCI or UCI

**Option A — LuCI:** Navigate to **Network → CAKE Secondwan → Settings** and fill in your values, then click *Save & Apply*.

**Option B — UCI directly:**

```sh
uci set cake_secondwan.global.wan_iface='lan1'    # kernel interface name
uci set cake_secondwan.global.ifb_iface='ifb-lan1'
uci set cake_secondwan.global.uplink='190Mbit'
uci set cake_secondwan.global.downlink='190Mbit'
uci set cake_secondwan.global.rtt='20ms'          # RTT to ISP
uci set cake_secondwan.global.overhead='18'       # 18=Ethernet, 22=PPPoE, 44=PPPoE+VLAN
uci commit cake_secondwan
sh /etc/script/cake-tune.sh
```

### 3. Restart rpcd

```sh
/etc/init.d/rpcd restart
```

### 4. Open LuCI

Navigate to **Network → CAKE Secondwan**.

## CAKE options applied

| Parameter | Egress (upload) | Ingress (download) |
|-----------|----------------|--------------------|
| Scheduler | `diffserv4` | `diffserv4` |
| Flow isolation | `dual-srchost` | `dual-dsthost` |
| NAT awareness | `nat` | `nat` |
| Wash DSCP | `wash` | `wash` |
| ACK filter | `ack-filter` | `no-ack-filter` |
| GSO | `split-gso` | `split-gso` |
| ATM | `noatm` | `noatm` |
| Direction | — | `ingress` |

`nat` on the ingress IFB is required for per-host fairness behind NAT — without it CAKE cannot distinguish individual clients and drops accumulate.

## Persistence after firmware restore

Add to `/etc/sysupgrade.conf`:

```
/etc/config/cake_secondwan
/etc/init.d/cake
/etc/hotplug.d/iface/99-cake
/www/luci-static/resources/view/cake_secondwan/
/usr/share/luci/menu.d/luci-app-cake-secondwan.json
/usr/share/rpcd/acl.d/luci-app-cake-secondwan.json
/etc/script/cake-tune.sh
```

## How ingress shaping works

```
lan1 (WAN) ──► ingress qdisc ──► tc filter (ctinfo + mirred)
                                        │
                                        ▼
                                   ifb-lan1 ──► CAKE (ingress, dual-dsthost, nat)
```

Traffic arriving on `lan1` is redirected via `mirred` to the IFB device `ifb-lan1`, where CAKE shapes it as egress. `ctinfo` copies DSCP marks from conntrack so classification survives the redirect.

## License

MIT
