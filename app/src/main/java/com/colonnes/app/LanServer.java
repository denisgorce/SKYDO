package com.colonnes.app;

import android.net.Uri;
import org.json.JSONArray;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Mini serveur HTTP local : relaie l'état de la partie (hôte) vers les autres téléphones. */
class LanServer {
  static final int PORT = 8765;
  private String state = "null";
  private int ver = 0;
  private final ConcurrentLinkedQueue<String> actions = new ConcurrentLinkedQueue<>();
  private final ExecutorService pool = Executors.newCachedThreadPool();
  private ServerSocket ss;

  synchronized boolean start() {
    if (ss != null) return true;
    try {
      ss = new ServerSocket();
      ss.setReuseAddress(true);
      ss.bind(new InetSocketAddress(PORT));
    } catch (IOException e) { ss = null; return false; }
    final ServerSocket s0 = ss;
    pool.execute(() -> {
      while (!s0.isClosed()) {
        try { final Socket c = s0.accept(); pool.execute(() -> handle(c)); }
        catch (IOException e) { break; }
      }
    });
    return true;
  }

  synchronized void stop() {
    try { if (ss != null) ss.close(); } catch (IOException ignored) {}
    ss = null;
  }

  synchronized void setState(String json) { state = json; ver++; }
  private synchronized String stateSince(int v) { return v == ver ? null : "{\"v\":" + ver + ",\"g\":" + state + "}"; }

  String poll() {
    JSONArray a = new JSONArray(); String s;
    while ((s = actions.poll()) != null) a.put(s);
    return a.toString();
  }

  private void handle(Socket c) {
    try (Socket s = c) {
      s.setSoTimeout(3000);
      BufferedReader r = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
      String line = r.readLine(); if (line == null) return;
      String[] p = line.split(" "); if (p.length < 2) return;
      String h; while ((h = r.readLine()) != null && !h.isEmpty()) { }
      Uri u = Uri.parse("http://h" + p[1]);
      String path = u.getPath(), body = ""; int code = 200;
      if ("/state".equals(path)) {
        int v = -1; try { v = Integer.parseInt(u.getQueryParameter("v")); } catch (Exception ignored) {}
        body = stateSince(v); if (body == null) { body = ""; code = 204; }
      } else if ("/action".equals(path)) {
        String q = u.getQueryParameter("q");
        if (q != null && q.length() < 2000 && actions.size() < 500) actions.add(q);
        body = "ok";
      } else code = 404;
      byte[] b = body.getBytes(StandardCharsets.UTF_8);
      String head = "HTTP/1.1 " + code + (code == 200 ? " OK" : code == 204 ? " No Content" : " Not Found")
          + "\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: "
          + b.length + "\r\n\r\n";
      OutputStream o = s.getOutputStream();
      o.write(head.getBytes(StandardCharsets.UTF_8)); o.write(b); o.flush();
    } catch (Exception ignored) {}
  }

  static String ips() {
    StringBuilder sb = new StringBuilder();
    try {
      for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
        if (!ni.isUp() || ni.isLoopback()) continue;
        for (InetAddress a : Collections.list(ni.getInetAddresses()))
          if (a instanceof Inet4Address && a.isSiteLocalAddress()) {
            if (sb.length() > 0) sb.append(',');
            sb.append(a.getHostAddress());
          }
      }
    } catch (Exception ignored) {}
    return sb.toString();
  }
}
