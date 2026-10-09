package com.example.base;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;

import org.testng.annotations.AfterMethod;
import org.testng.annotations.AfterSuite;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.BeforeSuite;

/**
 * BaseTest — Playwright lifecycle (Java / TestNG), the analog of the Selenium BaseTest.
 *
 * Object hierarchy:
 *   Playwright  -> the driver process        (once per suite — expensive)
 *   Browser     -> a launched browser        (once per suite)
 *   BrowserContext -> an isolated session, like a fresh incognito profile (PER TEST)
 *   Page        -> a tab inside the context  (PER TEST)
 *
 * PARALLEL-SAFE: Playwright and Browser are shared and thread-safe, but Page and
 * BrowserContext are NOT — so, exactly like the Selenium framework, the per-test
 * Page/Context are held in ThreadLocals. With testng.xml parallel="methods",
 * each thread gets its own context + page. Access the page via getPage().
 *   @BeforeMethod -> fresh context + page for THIS thread
 *   @AfterMethod  -> close the context and remove() the ThreadLocals
 */
public abstract class BaseTest {

    // Shared across threads (thread-safe in Playwright).
    protected static Playwright playwright;
    protected static Browser browser;

    // Per-thread (NOT shared) — one context + page per test thread.
    private static final ThreadLocal<BrowserContext> CONTEXT = new ThreadLocal<>();
    private static final ThreadLocal<Page> PAGE = new ThreadLocal<>();

    /** The current thread's Page — use this everywhere instead of a field. */
    public Page getPage() {
        return PAGE.get();
    }

    @BeforeSuite
    public void launchBrowser() {
        playwright = Playwright.create();

        // -Dbrowser=chromium|firefox|webkit (default chromium); -Dheaded=true to watch.
        String browserName = System.getProperty("browser", "chromium").toLowerCase();
        boolean headed = "true".equalsIgnoreCase(System.getProperty("headed", "false"));
        BrowserType.LaunchOptions opts = new BrowserType.LaunchOptions().setHeadless(!headed);

        switch (browserName) {
            case "firefox" -> browser = playwright.firefox().launch(opts);
            case "webkit"  -> browser = playwright.webkit().launch(opts);
            default        -> browser = playwright.chromium().launch(opts);
        }
    }

    @BeforeMethod
    public void createContextAndPage() {
        BrowserContext context = browser.newContext();   // isolated session for THIS test
        CONTEXT.set(context);
        PAGE.set(context.newPage());
    }

    @AfterMethod(alwaysRun = true)
    public void closeContext() {
        BrowserContext context = CONTEXT.get();
        if (context != null) {
            context.close();
            CONTEXT.remove();
            PAGE.remove();   // clear so a reused thread starts clean
        }
    }

    @AfterSuite(alwaysRun = true)
    public void closeBrowser() {
        if (browser != null) browser.close();
        if (playwright != null) playwright.close();
    }
}
