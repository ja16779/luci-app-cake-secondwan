'use strict';
'require view';
'require poll';
'require fs';
'require dom';
'require uci';

// --- Historial en memoria (60 muestras x 5s = 5 minutos) ---
var HISTORY_LEN = 60;
var history = {
    egress:  { delay: [], throughput: [], bytes_prev: null },
    ingress: { delay: [], throughput: [], bytes_prev: null }
};

// --- Formatters ---
var formatTime = function(us) {
    if (!us) return '0 µs';
    if (us >= 1000000) return (us/1000000).toFixed(2) + ' s';
    if (us >= 1000) return (us/1000).toFixed(2) + ' ms';
    return us + ' µs';
};

var formatBytes = function(b) {
    if (!b) return '0 B';
    var u = ['B','KiB','MiB','GiB'];
    var i = Math.min(3, Math.floor(Math.log(b)/Math.log(1024)));
    return (b/Math.pow(1024,i)).toFixed(2) + ' ' + u[i];
};

// --- Obtener datos tc ---
var getCakeData = function(wan, ifb) {
    return Promise.all([
        fs.exec('tc', ['-s', '-j', 'qdisc', 'show', 'dev', wan]),
        fs.exec('tc', ['-s', '-j', 'qdisc', 'show', 'dev', ifb])
    ]).then(function(res) {
        var wanQ    = (JSON.parse(res[0].stdout || '[]') || []).filter(function(q){return q.kind==='cake';})[0] || null;
        var ingressQ= (JSON.parse(res[1].stdout || '[]') || []).filter(function(q){return q.kind==='cake';})[0] || null;
        return { wan: wanQ, ingress: ingressQ };
    });
};

// --- Actualizar historial ---
var pushHistory = function(hist, cake) {
    if (!cake) return;
    var tins = cake.tins || [];
    var totalDelay = 0, countTins = 0;
    tins.forEach(function(t) {
        if ((t.sent_packets || 0) > 0) {
            totalDelay += (t.avg_delay_us || 0);
            countTins++;
        }
    });
    var avgDelay = countTins > 0 ? (totalDelay / countTins / 1000) : 0;
    hist.delay.push(avgDelay);
    if (hist.delay.length > HISTORY_LEN) hist.delay.shift();

    var bytes = cake.bytes || 0;
    var tpMbps = 0;
    if (hist.bytes_prev !== null && bytes >= hist.bytes_prev) {
        tpMbps = ((bytes - hist.bytes_prev) * 8) / 1e6 / 5;
    }
    hist.bytes_prev = bytes;
    hist.throughput.push(tpMbps);
    if (hist.throughput.length > HISTORY_LEN) hist.throughput.shift();
};

// --- Canvas line chart ---
var drawLineChart = function(canvas, data, labelY, color) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var padL = 48, padR = 10, padT = 12, padB = 22;
    var w = W - padL - padR, h = H - padT - padB;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#2a2a45';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
        var y = padT + (h / 4) * g;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + w, y); ctx.stroke();
    }

    if (!data || data.length < 2) {
        ctx.fillStyle = '#555';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Acumulando datos...', padL + w/2, padT + h/2);
        return;
    }

    var vmax = Math.max.apply(null, data) || 1;
    vmax = vmax * 1.15;

    ctx.fillStyle = '#888';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    for (var g2 = 0; g2 <= 4; g2++) {
        var val = vmax * (1 - g2 / 4);
        var yy = padT + (h / 4) * g2;
        ctx.fillText(val.toFixed(1), padL - 3, yy + 3);
    }

    ctx.save();
    ctx.translate(10, padT + h/2);
    ctx.rotate(-Math.PI/2);
    ctx.fillStyle = color;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labelY, 0, 0);
    ctx.restore();

    ctx.fillStyle = '#555';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ['-5m','-4m','-3m','-2m','-1m','ahora'].forEach(function(lbl, i) {
        ctx.fillText(lbl, padL + (w/5)*i, H - 5);
    });

    ctx.beginPath();
    data.forEach(function(v, i) {
        var x = padL + (i / (HISTORY_LEN - 1)) * w;
        var y = padT + h - (Math.min(v, vmax) / vmax) * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(padL + ((data.length-1) / (HISTORY_LEN-1)) * w, padT + h);
    ctx.lineTo(padL, padT + h);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, padT, 0, padT + h);
    grad.addColorStop(0, color.replace('rgb(', 'rgba(').replace(')', ',0.35)'));
    grad.addColorStop(1, color.replace('rgb(', 'rgba(').replace(')', ',0.02)'));
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    data.forEach(function(v, i) {
        var x = padL + (i / (HISTORY_LEN - 1)) * w;
        var y = padT + h - (Math.min(v, vmax) / vmax) * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    var last = data[data.length - 1];
    ctx.fillStyle = color;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(last.toFixed(2) + ' ' + labelY, padL + w - 2, padT + 11);
};

// --- Bar chart DOM ---
var createBarChart = function(title, labels, values, color) {
    var max = Math.max.apply(null, values) || 1;
    var bars = values.map(function(v, i) {
        var pct = max > 0 ? (v / max * 150) : 0;
        var valStr = v > 1e6 ? (v/1e6).toFixed(1)+'M' :
                     v > 1e3 ? (v/1e3).toFixed(1)+'K' :
                     typeof v === 'number' ? v.toFixed(2) : String(v);
        return E('div', {style:'flex:1;text-align:center;padding:0 3px;display:flex;flex-direction:column;align-items:center;'}, [
            E('div', {style:'font-size:10px;margin-bottom:3px;color:#ccc'}, valStr),
            E('div', {style:'background:'+color+';width:65%;height:'+Math.max(pct,2)+'px;border-radius:2px 2px 0 0'}),
            E('div', {style:'font-size:10px;margin-top:4px;white-space:nowrap;color:#888'}, labels[i])
        ]);
    });
    return E('div', {style:'background:#1a1a2e;border-radius:6px;padding:10px'}, [
        E('div', {style:'font-size:11px;font-weight:bold;color:#aaa;margin-bottom:6px'}, title),
        E('div', {style:'display:flex;height:190px;align-items:flex-end;'}, bars)
    ]);
};

// --- Tabla resumen ---
var renderSummaryTable = function(cake) {
    var opts = cake.options || {};
    var rows = [
        ['Bandwidth',  (opts.bandwidth||0)/1000 + ' Kbit/s'],
        ['Enviado',    formatBytes(cake.bytes||0) + '  ·  ' + (cake.packets||0) + ' pkts'],
        ['Drops',      String(cake.drops||0)],
        ['Overlimits', String(cake.overlimits||0)],
        ['Memoria',    formatBytes(cake.memory_used||0) + ' / ' + formatBytes(cake.memory_limit||4194304)],
        ['Overhead',   (opts.overhead||0) + ' bytes'],
        ['NAT',        opts.nat ? 'si' : 'no'],
        ['Wash',       opts.wash ? 'si' : 'no'],
    ];
    return E('table', {style:'width:auto;margin-bottom:10px;font-size:12px;border-collapse:collapse'},
        rows.map(function(r) {
            return E('tr', {}, [
                E('td', {style:'font-weight:bold;padding:2px 14px 2px 0;color:#8899cc;white-space:nowrap'}, r[0]),
                E('td', {style:'padding:2px 0;color:#dde'}, r[1])
            ]);
        })
    );
};

// --- Tabla tins ---
var renderTinTable = function(tins) {
    var names = ['Bulk','Best Effort','Video','Voice'];
    var header = E('tr', {}, ['Tin','Umbral','Peak Delay','Avg Delay','Drops','ECN','Pkts'].map(function(h){
        return E('th', {style:'text-align:left;padding:4px 10px;font-size:11px;background:#1e1e38;color:#99aadd'}, h);
    }));
    var rows = tins.map(function(t, i) {
        var bg = i%2 ? '#12122a' : '#0e0e24';
        return E('tr', {style:'background:'+bg}, [
            E('td', {style:'padding:4px 10px;font-weight:bold;color:#88aaff'}, names[i]||('Tin '+i)),
            E('td', {style:'padding:4px 10px;color:#ccc'}, (t.threshold_rate||0)/1000 + ' Kbit/s'),
            E('td', {style:'padding:4px 10px;color:#ffaa44'}, formatTime(t.peak_delay_us||0)),
            E('td', {style:'padding:4px 10px;color:#44aaff'}, formatTime(t.avg_delay_us||0)),
            E('td', {style:'padding:4px 10px;color:'+((t.drops||0)>0?'#ff6666':'#888')}, String(t.drops||0)),
            E('td', {style:'padding:4px 10px;color:#bb88ff'}, String(t.ecn_mark||0)),
            E('td', {style:'padding:4px 10px;color:#88cc88'}, String(t.sent_packets||0)),
        ]);
    });
    return E('table', {style:'width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px'},
        [header].concat(rows)
    );
};

// --- Render seccion ---
var renderSection = function(cake, title, histKey, idDelay, idTp) {
    var tins = (cake && cake.tins) || [];
    var names = ['Bulk','Best Effort','Video','Voice'];

    var cvDelay = E('canvas', {id:idDelay, width:'600', height:'130',
        style:'width:100%;height:130px;border-radius:4px;display:block'});
    var cvTp = E('canvas', {id:idTp, width:'600', height:'130',
        style:'width:100%;height:130px;border-radius:4px;display:block'});

    var tinLabels = tins.map(function(t,i){ return names[i]||('Tin '+i); });
    var avgDelays = tins.map(function(t){ return (t.avg_delay_us||0)/1000; });
    var pkDelays  = tins.map(function(t){ return (t.peak_delay_us||0)/1000; });
    var drops     = tins.map(function(t){ return t.drops||0; });
    var ecns      = tins.map(function(t){ return t.ecn_mark||0; });
    var pkts      = tins.map(function(t){ return t.sent_packets||0; });

    return E('div', {style:'margin-bottom:24px'}, [
        E('h3', {style:'border-bottom:2px solid #3344aa;padding-bottom:.4em;color:#88aaff;margin-bottom:12px'}, title),
        cake ? renderSummaryTable(cake) : E('p', {style:'color:#f88'}, 'Sin datos'),

        E('div', {style:'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px'}, [
            E('div', {style:'background:#1a1a2e;border-radius:6px;padding:10px'}, [
                E('div', {style:'font-size:11px;font-weight:bold;color:#66aaff;margin-bottom:6px'}, 'Avg Delay promedio (ms)'),
                cvDelay
            ]),
            E('div', {style:'background:#1a1a2e;border-radius:6px;padding:10px'}, [
                E('div', {style:'font-size:11px;font-weight:bold;color:#66ffaa;margin-bottom:6px'}, 'Throughput (Mbit/s)'),
                cvTp
            ])
        ]),

        tins.length ? E('div', {style:'display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px'}, [
            createBarChart('Avg Delay (ms)', tinLabels, avgDelays, 'rgb(80,160,255)'),
            createBarChart('Peak Delay (ms)', tinLabels, pkDelays, 'rgb(255,150,50)'),
            createBarChart('Drops', tinLabels, drops, 'rgb(255,90,90)'),
            createBarChart('ECN Marks', tinLabels, ecns, 'rgb(180,90,255)'),
            createBarChart('Paquetes', tinLabels, pkts, 'rgb(80,210,130)'),
        ]) : E(''),

        tins.length ? E('div', {}, [
            E('div', {style:'font-size:11px;font-weight:bold;color:#888;margin-bottom:6px'}, 'Detalle por Tin'),
            renderTinTable(tins)
        ]) : E('')
    ]);
};

var updateCanvases = function() {
    var pairs = [
        ['egress',  'cv-eg-delay', 'cv-eg-tp',  'rgb(80,160,255)',  'rgb(80,210,130)'],
        ['ingress', 'cv-in-delay', 'cv-in-tp',  'rgb(255,150,50)',  'rgb(180,90,255)']
    ];
    pairs.forEach(function(p) {
        var hist = history[p[0]];
        var cvD = document.getElementById(p[1]);
        var cvT = document.getElementById(p[2]);
        if (cvD) drawLineChart(cvD, hist.delay,      'ms',     p[3]);
        if (cvT) drawLineChart(cvT, hist.throughput, 'Mbit/s', p[4]);
    });
};

return view.extend({
    load: function() {
        return uci.load('cake_secondwan');
    },

    render: function() {
        var wanIface = uci.get('cake_secondwan', 'global', 'wan_iface') || 'lan1';
        var ifbIface = uci.get('cake_secondwan', 'global', 'ifb_iface') || 'ifb-lan1';
        var uplink   = uci.get('cake_secondwan', 'global', 'uplink')    || '?';

        var container = E('div', {style:'background:#0d0d1a;padding:14px;min-height:300px'}, [
            E('h2', {style:'color:#88aaff;margin-bottom:2px'},
                'CAKE — Secondwan (' + wanIface + ' / ' + uplink + ')'),
            E('p',  {style:'color:#555;font-size:.82em;margin-bottom:16px'},
                'Actualización cada 5 s · Historial: 5 min (60 muestras)'),
            E('div', {id:'cake-sw-egress'},  E('p', {style:'color:#666'}, 'Cargando egress...')),
            E('hr',  {style:'border-color:#2a2a44;margin:16px 0'}),
            E('div', {id:'cake-sw-ingress'}, E('p', {style:'color:#666'}, 'Cargando ingress...'))
        ]);

        poll.add(function() {
            return getCakeData(wanIface, ifbIface).then(function(data) {
                pushHistory(history.egress,  data.wan);
                pushHistory(history.ingress, data.ingress);

                var elE = document.getElementById('cake-sw-egress');
                var elI = document.getElementById('cake-sw-ingress');
                if (elE) dom.content(elE, renderSection(
                    data.wan,     'Egress (Upload) — ' + wanIface, 'egress',  'cv-eg-delay', 'cv-eg-tp'));
                if (elI) dom.content(elI, renderSection(
                    data.ingress, 'Ingress (Download) — ' + ifbIface, 'ingress', 'cv-in-delay', 'cv-in-tp'));

                setTimeout(updateCanvases, 60);
            }).catch(function(err) {
                var el = document.getElementById('cake-sw-egress');
                if (el) dom.content(el, E('p', {style:'color:#f66'}, 'Error: ' + err));
            });
        }, 5);

        return container;
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
