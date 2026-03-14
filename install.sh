#!/bin/sh
# install.sh — luci-app-cake-secondwan
# Instala el dashboard CAKE Secondwan en OpenWrt 25.12
# Uso: sh install.sh

BASE="https://raw.githubusercontent.com/ja16779/luci-app-cake-secondwan/master"

echo "==> Instalando luci-app-cake-secondwan..."

# Crear directorios
mkdir -p /www/luci-static/resources/view/cake_secondwan
mkdir -p /usr/share/luci/menu.d
mkdir -p /usr/share/rpcd/acl.d
mkdir -p /etc/hotplug.d/iface
mkdir -p /etc/script

# Descargar archivos
wget -qO /etc/config/cake_secondwan               "$BASE/config/cake_secondwan"        && echo "OK config/cake_secondwan"
wget -qO /etc/script/cake-tune.sh                 "$BASE/script/cake-tune.sh"           && echo "OK script/cake-tune.sh"
wget -qO /etc/init.d/cake                         "$BASE/init.d/cake"                   && echo "OK init.d/cake"
wget -qO /etc/hotplug.d/iface/99-cake             "$BASE/hotplug/99-cake"               && echo "OK hotplug/99-cake"
wget -qO /usr/share/luci/menu.d/luci-app-cake-secondwan.json   "$BASE/luci/menu.json"   && echo "OK luci/menu.json"
wget -qO /usr/share/rpcd/acl.d/luci-app-cake-secondwan.json    "$BASE/rpcd/acl.json"    && echo "OK rpcd/acl.json"
wget -qO /www/luci-static/resources/view/cake_secondwan/statistics.js  "$BASE/luci/statistics.js" && echo "OK luci/statistics.js"
wget -qO /www/luci-static/resources/view/cake_secondwan/settings.js    "$BASE/luci/settings.js"   && echo "OK luci/settings.js"

# Permisos
chmod +x /etc/script/cake-tune.sh
chmod +x /etc/init.d/cake
/etc/init.d/cake enable

# sysupgrade.conf — agregar entradas si no existen
for entry in \
    "/etc/config/cake_secondwan" \
    "/etc/init.d/cake" \
    "/etc/hotplug.d/iface/99-cake" \
    "/www/luci-static/resources/view/cake_secondwan/" \
    "/usr/share/luci/menu.d/luci-app-cake-secondwan.json" \
    "/usr/share/rpcd/acl.d/luci-app-cake-secondwan.json" \
    "/etc/script/cake-tune.sh"
do
    grep -qF "$entry" /etc/sysupgrade.conf 2>/dev/null || echo "$entry" >> /etc/sysupgrade.conf
done
echo "OK sysupgrade.conf"

# Reiniciar rpcd y aplicar CAKE
/etc/init.d/rpcd restart
sh /etc/script/cake-tune.sh

echo ""
echo "==> Instalacion completa."
echo "    Configura la interfaz en LuCI: Network -> CAKE Secondwan -> Settings"
echo "    O via UCI:"
echo "      uci set cake_secondwan.global.wan_iface='tu_interfaz'"
echo "      uci set cake_secondwan.global.uplink='190Mbit'"
echo "      uci set cake_secondwan.global.downlink='190Mbit'"
echo "      uci commit cake_secondwan"
echo "      sh /etc/script/cake-tune.sh"
