const PdfPrinter=require('./GooglePdfPrinter');
// var globalTunnel = require('global-tunnel-ng');
 
// globalTunnel.initialize({
//   host: '127.0.0.1',
//   port: 1080,
//  // proxyAuth: '981326632@qq.com:qwQm0B', // optional authentication
//   sockets: 50 // optional pool size for each http and https
// });


let printer = new PdfPrinter('https://www.chartjs.org/docs/latest/','chartJs');
printer.setMenuContainer('nav');
printer.run();

// globalTunnel.end();