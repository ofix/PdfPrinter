const PdfPrinter=require('./FlatPdfPrinter');
// var globalTunnel = require('global-tunnel-ng');
 
// globalTunnel.initialize({
//   host: '127.0.0.1',
//   port: 1080,
//  // proxyAuth: '981326632@qq.com:qwQm0B', // optional authentication
//   sockets: 50 // optional pool size for each http and https
// });

let options={
    pdfEntry:'https://gitee.com/progit/', //PDF文件访问URL入口
    pdfName:'proGit', //需要打印的PDF文件名
    urlPrefix:'https://gitee.com/progit/',//URL前缀，
    removePrintCss:true,//时候移除打印CSS
    printContainer:'body',//打印的区域包裹的容器
    menuContainer:'.book_toc',//打印的菜单容器
    dirtyInnerElements:['#book-chapters','.bottom-nav','#chapters-dropdown'],//容器里面的元素
}
let printer = new PdfPrinter(options);
printer.run();

// globalTunnel.end();