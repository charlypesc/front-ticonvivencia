// Tarjeta de contacto de miConvivencia: arma el vCard desde los data-* del <article class="card">,
// dibuja el QR y descarga el .vcf. Lo usan contacto.html y contacto-ricardo.html.
(function(){
  var card = document.querySelector('.card');
  var nombre = card.getAttribute('data-name');
  var tel = card.getAttribute('data-tel');
  var emails = card.getAttribute('data-emails').split(',');
  var partes = nombre.split(' ');

  var lineas = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:' + partes.slice(1).join(' ') + ';' + partes[0] + ';;;',
    'FN:' + nombre,
    'ORG:miConvivencia',
    'TEL;TYPE=CELL:' + tel
  ];
  emails.forEach(function(e){ lineas.push('EMAIL;TYPE=WORK:' + e.trim()); });
  lineas.push('URL:https://miconvivencia.cl', 'NOTE:miConvivencia — Gestión de la convivencia escolar', 'END:VCARD');
  var VCARD = lineas.join('\r\n');

  // qrcode.js codifica en bytes UTF-8 si se le pide; sin esto las tildes salen rotas al escanear
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  var qr = qrcode(0, 'M');
  qr.addData(VCARD, 'Byte');
  qr.make();

  var canvas = document.getElementById('qr');
  var cell = qr.getModuleCount();
  var scale = 6;
  canvas.width = cell * scale;
  canvas.height = cell * scale;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1a1a18';
  for(var r=0;r<cell;r++){
    for(var c=0;c<cell;c++){
      if(qr.isDark(r,c)){
        ctx.fillRect(c*scale, r*scale, scale, scale);
      }
    }
  }

  // En el celular, abrir el .vcf lanza "Agregar a contactos"
  document.getElementById('guardar').addEventListener('click', function(){
    var blob = new Blob([VCARD], {type:'text/vcard;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre + ' - miConvivencia.vcf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  });
})();
