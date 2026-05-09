// @ts-nocheck
import Document, { Html, Head, Main, NextScript } from "next/document";

const errorScript = `
(function() {
  function showErr(msg) {
    var d = document.createElement('div');
    d.style.cssText = 'background:#8b0000;color:#fff;padding:8px;font-family:monospace;font-size:12px;position:fixed;top:0;left:0;right:0;z-index:9999;word-break:break-all;white-space:pre-wrap';
    d.textContent = msg;
    document.body ? document.body.appendChild(d) : document.addEventListener('DOMContentLoaded', function(){ document.body.appendChild(d); });
  }
  window.onerror = function(msg, src, line) {
    showErr('JS Error: ' + msg + ' @ ' + src + ':' + line);
  };
  window.onunhandledrejection = function(e) {
    showErr('Promise Error: ' + (e.reason && (e.reason.stack || e.reason.message || e.reason)));
  };
  var _ce = console.error.bind(console);
  console.error = function() {
    _ce.apply(console, arguments);
    showErr('console.error: ' + Array.prototype.slice.call(arguments).join(' '));
  };
})();
`;

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          <script dangerouslySetInnerHTML={{ __html: errorScript }} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
