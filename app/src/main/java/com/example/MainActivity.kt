package com.example

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.viewinterop.AndroidView
import com.example.ui.theme.MyApplicationTheme

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    setContent {
      MyApplicationTheme(darkTheme = true) {
        DigiSwissApp()
      }
    }
  }
}

class AndroidBridge(private val context: Context) {
  @JavascriptInterface
  fun vibrate(durationMs: Long) {
    try {
      val duration = durationMs.coerceIn(50, 2000)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        vibratorManager?.defaultVibrator?.vibrate(
          VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE)
        )
      } else {
        @Suppress("DEPRECATION")
        val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          vibrator?.vibrate(
            VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE)
          )
        } else {
          @Suppress("DEPRECATION")
          vibrator?.vibrate(duration)
        }
      }
    } catch (e: Exception) {
      Log.w("DigiSwissBridge", "Vibration failed: ${e.message}")
    }
  }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun DigiSwissApp() {
  var webViewRef by remember { mutableStateOf<WebView?>(null) }
  var canGoBack by remember { mutableStateOf(false) }

  BackHandler(enabled = canGoBack) {
    webViewRef?.goBack()
  }

  Scaffold(
    modifier = Modifier
      .fillMaxSize()
      .testTag("digiswiss_main_scaffold"),
    contentWindowInsets = WindowInsets.safeDrawing,
    containerColor = Color(0xFF080D1A)
  ) { innerPadding ->
    Box(
      modifier = Modifier
        .fillMaxSize()
        .padding(innerPadding)
        .background(Color(0xFF080D1A))
    ) {
      AndroidView(
        modifier = Modifier
          .fillMaxSize()
          .testTag("digiswiss_webview"),
        factory = { context ->
          WebView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
              ViewGroup.LayoutParams.MATCH_PARENT,
              ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(android.graphics.Color.parseColor("#080D1A"))

            settings.apply {
              javaScriptEnabled = true
              domStorageEnabled = true
              databaseEnabled = true
              allowFileAccess = true
              allowContentAccess = true
              allowFileAccessFromFileURLs = true
              allowUniversalAccessFromFileURLs = true
              cacheMode = WebSettings.LOAD_DEFAULT
              useWideViewPort = true
              loadWithOverviewMode = true
              displayZoomControls = false
              builtInZoomControls = false
              mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                safeBrowsingEnabled = false
              }
            }

            addJavascriptInterface(AndroidBridge(context), "AndroidBridge")

            webChromeClient = object : WebChromeClient() {
              override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                Log.d(
                  "DigiSwissWeb",
                  "${consoleMessage?.message()} [line ${consoleMessage?.lineNumber()} in ${consoleMessage?.sourceId()}]"
                )
                return true
              }
            }

            webViewClient = object : WebViewClient() {
              override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                canGoBack = view?.canGoBack() == true
              }

              override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                canGoBack = view?.canGoBack() == true
              }

              override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
              ) {
                super.onReceivedError(view, request, error)
                Log.e("DigiSwissWeb", "WebView error: ${error?.description} on ${request?.url}")
              }

              override fun onRenderProcessGone(
                view: WebView?,
                detail: RenderProcessGoneDetail?
              ): Boolean {
                Log.w("DigiSwissWeb", "Chromium render process gone, safely handled: ${detail?.didCrash()}")
                view?.let {
                  (it.parent as? ViewGroup)?.removeView(it)
                  it.destroy()
                }
                return true
              }

              override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
              ): Boolean {
                val url = request?.url?.toString() ?: return false
                if (url.startsWith("file://") || url.startsWith("https://script.google.com")) {
                  return false
                }
                return false
              }
            }

            loadUrl("file:///android_asset/web/index.html")
            webViewRef = this
          }
        },
        update = { webView ->
          webViewRef = webView
        }
      )
    }
  }
}
