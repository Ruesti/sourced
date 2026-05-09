// @ts-nocheck
import Document, { Html, Head, Main, NextScript } from "next/document";

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head />
        <body>
          <Main />
          <NextScript />
          <script dangerouslySetInnerHTML={{ __html: `
window.onerror = function(msg, src, line, col, err) {
  document.body.insertAdjacentHTML('beforeend',
    '<div style="background:#8b0000;color:#fff;padding:8px;font-family:monospace;font-size:12px;position:fixed;top:0;left:0;right:0;z-index:9999;word-break:break-all">' +
    'JS Error: ' + msg + ' @ ' + src + ':' + line + '</div>'
  );
};
window.onunhandledrejection = function(e) {
  document.body.insertAdjacentHTML('beforeend',
    '<div style="background:#8b0000;color:#fff;padding:8px;font-family:monospace;font-size:12px;position:fixed;top:0;left:0;right:0;z-index:9999;word-break:break-all">' +
    'Promise Error: ' + (e.reason && (e.reason.message || e.reason)) + '</div>'
  );
};
` }} />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
