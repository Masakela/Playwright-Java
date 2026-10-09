package com.example.base;

import java.util.HashMap;
import java.util.Map;

import com.example.utils.Config;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;

import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;

/**
 * BaseTest — Playwright lifecycle (Java / TestNG), the analog of the Selenium BaseTest.
 *
 * THREAD-SAFETY: Playwright for Java is NOT thread-safe. Every object must be used on
 * the SAME thread that created the Playwright instance that owns it. With testng.xml
 * parallel="methods", sharing one Playwright/Browser across threads throws driver
 * errors like "Cannot find object to call __adopt__: browser-context@...".
 *
 * So each test method gets its OWN Playwright + Browser + BrowserContext + Page, all
 * created on the test thread (held in ThreadLocals) and torn down afterwards. This is
 * the pattern Playwright recommends for parallel TestNG. Access the page via getPage().
 *   @BeforeMethod -> fresh Playwright/Browser/Context/Page for THIS thread
 *   @AfterMethod  -> close them all and clear the ThreadLocals
 */
public abstract class BaseTest {

    private static final ThreadLocal<Playwright> PLAYWRIGHT = new ThreadLocal<>();
    private static final ThreadLocal<Browser> BROWSER = new ThreadLocal<>();
    private static final ThreadLocal<BrowserContext> CONTEXT = new ThreadLocal<>();
    private static final ThreadLocal<Page> PAGE = new ThreadLocal<>();

    /** The current thread's Page — use this everywhere instead of a field. */
    public Page getPage() {
        return PAGE.get();
    }

    /** The current thread's Playwright — used by AgentBaseTest to build an API context. */
    protected Playwright playwright() {
        return PLAYWRIGHT.get();
    }

    @BeforeMethod
    public void setUp() {
        Playwright pw = createPlaywright();
        PLAYWRIGHT.set(pw);

        // -Dbrowser=chromium|firefox|webkit (default chromium); -Dheaded=true to watch.
        String browserName = System.getProperty("browser", "chromium").toLowerCase();
        boolean headed = "true".equalsIgnoreCase(System.getProperty("headed", "false"));
        BrowserType.LaunchOptions opts = new BrowserType.LaunchOptions().setHeadless(!headed);

        Browser b = switch (browserName) {
            case "firefox" -> pw.firefox().launch(opts);
            case "webkit"  -> pw.webkit().launch(opts);
            default        -> pw.chromium().launch(opts);
        };
        BROWSER.set(b);

        BrowserContext context = b.newContext();   // isolated session for THIS test
        CONTEXT.set(context);
        PAGE.set(context.newPage());
    }

    @AfterMethod(alwaysRun = true)
    public void tearDown() {
        try { if (CONTEXT.get() != null) CONTEXT.get().close(); } catch (Exception ignored) { }
        try { if (BROWSER.get() != null) BROWSER.get().close(); } catch (Exception ignored) { }
        try { if (PLAYWRIGHT.get() != null) PLAYWRIGHT.get().close(); } catch (Exception ignored) { }
        PAGE.remove();
        CONTEXT.remove();
        BROWSER.remove();
        PLAYWRIGHT.remove();
    }

    private static Playwright createPlaywright() {
        Playwright.CreateOptions opts = proxyBypassOptions();
        return (opts != null) ? Playwright.create(opts) : Playwright.create();
    }

    /**
     * CreateOptions that add NO_PROXY/no_proxy for local hosts (so the Playwright driver
     * and its request context bypass a corporate proxy that would otherwise intercept a
     * localhost call and answer 403), or null when the agent endpoint isn't local.
     * setEnv() is MERGED onto the inherited environment, so nothing else is lost.
     */
    private static Playwright.CreateOptions proxyBypassOptions() {
        String base = Config.agentBaseUrl();
        if (base == null
                || !base.matches("(?i)^https?://(localhost|127\\.0\\.0\\.1|\\[?::1\\]?)(:.*|/.*|)$")) {
            return null;
        }
        String locals = "localhost,127.0.0.1,::1";
        String existing = System.getenv("NO_PROXY");
        if (existing == null || existing.isBlank()) existing = System.getenv("no_proxy");
        String merged = (existing == null || existing.isBlank()) ? locals : existing + "," + locals;

        Map<String, String> env = new HashMap<>();
        env.put("NO_PROXY", merged);
        env.put("no_proxy", merged);
        return new Playwright.CreateOptions().setEnv(env);
    }
}
