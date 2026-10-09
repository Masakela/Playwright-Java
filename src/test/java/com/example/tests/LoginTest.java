package com.example.tests;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;
import static org.testng.Assert.assertTrue;

import java.util.List;

import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import com.example.base.BaseTest;
import com.example.pages.InventoryPage;
import com.example.pages.LoginPage;
import com.example.utils.ExcelReader;

/**
 * Login tests (Playwright / TestNG).
 *
 *  - assertThat(locator).isVisible() is a WEB-FIRST assertion: auto-retries until
 *    the condition holds or times out — so there's no explicit wait.
 *  - @DataProvider drives the data-driven tests (same as your Selenium framework).
 *  - getPage() returns THIS thread's Page (ThreadLocal in BaseTest).
 */
public class LoginTest extends BaseTest {

    @DataProvider(name = "goodLogins")
    public Object[][] goodLogins() {
        List<String[]> rows = ExcelReader.readAsRows("src/test/resources/logins.xlsx", "GoodLogin");
        return rows.stream().map(r -> new Object[]{r[0], r[1]}).toArray(Object[][]::new);
    }

    @DataProvider(name = "badLogins")
    public Object[][] badLogins() {
        return new Object[][]{
                {"locked_out_user", "secret_sauce", "locked out"},
                {"standard_user", "wrong_password", "do not match"},
                {"", "secret_sauce", "Username is required"},
        };
    }

    @Test(dataProvider = "goodLogins", description = "Valid login lands on inventory")
    public void validLoginSucceeds(String user, String pass) {
        InventoryPage inventory = new LoginPage(getPage()).open().loginAs(user, pass);
        assertThat(inventory.container()).isVisible();   // web-first, auto-retries
    }

    @Test(dataProvider = "badLogins", description = "Invalid login shows the expected error")
    public void invalidLoginShowsError(String user, String pass, String expectedFragment) {
        String error = new LoginPage(getPage())
                .open()
                .loginExpectingFailure(user, pass)
                .getErrorMessage();

        assertTrue(error.contains(expectedFragment),
                "Expected error containing '" + expectedFragment + "' but got: " + error);
    }

    @Test(description = "Error is visible for an empty username")
    public void errorIsShownForEmptyUsername() {
        LoginPage login = new LoginPage(getPage()).open()
                .loginExpectingFailure("", "secret_sauce");
        assertThat(login.error()).isVisible();
    }
}
