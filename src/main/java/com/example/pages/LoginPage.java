package com.example.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;

/**
 * LoginPage — SauceDemo login page (Playwright / Java).
 *
 * Locators are declared as Playwright Locators (lazy — they re-resolve on each
 * use, so no stale-element issues). SauceDemo tags its fields with data-test
 * attributes, so getByTestId is the natural, stable choice — the direct analog
 * of the Selenium data-* hooks.
 */
public class LoginPage extends BasePage {

    private static final String URL = "https://www.saucedemo.com/";

    private final Locator username;
    private final Locator password;
    private final Locator loginButton;
    private final Locator errorMessage;

    public LoginPage(Page page) {
        super(page);
        this.username = page.getByTestId("username");
        this.password = page.getByTestId("password");
        this.loginButton = page.getByTestId("login-button");
        this.errorMessage = page.getByTestId("error");
    }

    public LoginPage open() {
        page.navigate(URL);
        return this;
    }

    /** A successful login lands on the inventory page, so return that page object. */
    public InventoryPage loginAs(String user, String pass) {
        username.fill(user);
        password.fill(pass);
        loginButton.click();
        return new InventoryPage(page);
    }

    /** For negative tests: log in but stay on the login page to read the error. */
    public LoginPage loginExpectingFailure(String user, String pass) {
        username.fill(user);
        password.fill(pass);
        loginButton.click();
        return this;
    }

    public String getErrorMessage() {
        return errorMessage.textContent();
    }

    /** Exposed so tests can use web-first assertions, e.g. assertThat(loginPage.error()).isVisible(). */
    public Locator error() {
        return errorMessage;
    }
}
