package com.colonnes.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
  private static final String START = "https://appassets.androidplatform.net/assets/www/index.html";
  private WebView web;
  private final LanServer server = new LanServer();
  private final ExecutorService net = Executors.newFixedThreadPool(4);

  @Override
  protected void onCreate(Bundle b) {
    super.onCreate(b);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    web = new WebView(this);
    setContentView(web);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
        .build();
    web.setWebViewClient(new WebViewClient() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        return loader.shouldInterceptRequest(r.getUrl());
      }
    });
    web.addJavascriptInterface(new Bridge(), "Android");
    if (b != null) web.restoreState(b); else web.loadUrl(START);
  }

  @Override
  protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }

  @Override
  protected void onDestroy() { server.stop(); net.shutdownNow(); super.onDestroy(); }

  @Override
  public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }

  class Bridge {
    @JavascriptInterface
    public void share(String text) {
      Intent i = new Intent(Intent.ACTION_SEND);
      i.setType("text/plain");
      i.putExtra(Intent.EXTRA_TEXT, text);
      startActivity(Intent.createChooser(i, "Inviter"));
    }

    @JavascriptInterface public String startHost() { return server.start() ? LanServer.ips() : ""; }
    @JavascriptInterface public void stopHost() { server.stop(); }
    @JavascriptInterface public String ips() { return LanServer.ips(); }
    @JavascriptInterface public void setState(String json) { server.setState(json); }
    @JavascriptInterface public String poll() { return server.poll(); }

    /** GET asynchrone ; réponse renvoyée via window.__net(id, code, body). */
    @JavascriptInterface
    public void http(final int id, final String url) {
      net.execute(() -> {
        int code = 0; String body = "";
        try {
          HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
          c.setConnectTimeout(2000); c.setReadTimeout(3000); c.setUseCaches(false);
          code = c.getResponseCode();
          if (code == 200) {
            InputStream in = c.getInputStream(); ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192]; int n; while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            body = bo.toString("UTF-8");
          }
          c.disconnect();
        } catch (Exception e) { code = 0; }
        final String js = "window.__net(" + id + "," + code + "," + JSONObject.quote(body) + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
      });
    }
  }
}
