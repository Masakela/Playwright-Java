package com.example.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;

/**
 * LoginPage — SauceDemo login page (Playwright / Java).
 *
 * SauceDemo tags its fields with the **data-test** attribute (not data-testid), so
 * these locators target [data-test='...'] explicitly. (Playwright's getByTestId()
 * defaults to data-testid, which the agent console uses - keeping the two layers on
 * their own attributes avoids a global testIdAttribute switch.) Locators are lazy -
 * they re-resolve on each use, so there are no stale-element issues.
 */
public class LoginPage extends BasePage {

    private static final String URL = "https://www.saucedemo.com/";

    private final Locator username;
    private final Locator password;
    private final Locator loginButton;
    private final Locator errorMessage;

    public LoginPage(Page page) {
        super(page);
        this.username = page.locator("[data-test='username']");
        this.password = page.locator("[data-test='password']");
        this.loginButton = page.locator("[data-test='login-button']");
        this.errorMessage = page.locator("[data-test='error']");
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
