'use strict';
'require view';
'require form';
'require uci';
'require fs';

var mapObj = null;

return view.extend({
    load: function() {
        return uci.load('cake_secondwan');
    },

    render: function() {
        var m, s, o;

        mapObj = new form.Map('cake_secondwan',
            'CAKE Secondwan — Configuración',
            'Ajustes de CAKE para el segundo enlace WAN. Guarda y aplica para activar los cambios.');

        s = mapObj.section(form.TypedSection, 'global', 'Interfaz');
        s.anonymous = true;
        s.addremove = false;

        o = s.option(form.Value, 'wan_iface', 'Interfaz WAN',
            'Nombre de la interfaz kernel del segundo WAN (ej: lan1, eth1, wan2)');
        o.datatype = 'string';
        o.rmempty = false;
        o.placeholder = 'lan1';

        o = s.option(form.Value, 'ifb_iface', 'Interfaz IFB',
            'Dispositivo IFB para ingress shaping (se crea automáticamente si no existe)');
        o.datatype = 'string';
        o.rmempty = false;
        o.placeholder = 'ifb-lan1';

        s = mapObj.section(form.TypedSection, 'global', 'Ancho de Banda');
        s.anonymous = true;
        s.addremove = false;

        o = s.option(form.Value, 'uplink', 'Upload / Egress',
            'Ancho de banda de subida (ej: 190Mbit, 50Mbit, 350Mbit)');
        o.datatype = 'string';
        o.rmempty = false;
        o.placeholder = '190Mbit';

        o = s.option(form.Value, 'downlink', 'Download / Ingress',
            'Ancho de banda de bajada');
        o.datatype = 'string';
        o.rmempty = false;
        o.placeholder = '190Mbit';

        o = s.option(form.Value, 'rtt', 'RTT estimado',
            'RTT al primer salto del ISP. Mayor RTT = más buffer. (ej: 20ms, 50ms)');
        o.datatype = 'string';
        o.placeholder = '20ms';

        o = s.option(form.Value, 'overhead', 'Overhead (bytes)',
            '18 = Ethernet directo · 22 = PPPoE · 44 = PPPoE + VLAN');
        o.datatype = 'uinteger';
        o.placeholder = '18';

        return mapObj.render();
    },

    handleSave: function(ev) {
        return mapObj.save(null, true);
    },

    handleSaveApply: function(ev) {
        var self = this;
        return this.handleSave(ev).then(function() {
            return fs.exec('/bin/sh', ['/etc/script/cake-tune.sh']).then(function(res) {
                if (res.code !== 0)
                    throw new Error('cake-tune.sh: ' + (res.stderr || 'error'));
            });
        });
    },

    handleReset: function(ev) {
        return mapObj.reset();
    }
});
