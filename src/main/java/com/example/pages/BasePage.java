package com.example.pages;

import com.microsoft.playwright.Page;

/**
 * BasePage — parent of every page object (Playwright version).
 *
 * Notice how much SMALLER this is than the Selenium BasePage: there are no
 * click/type/getText wait-helpers here. Playwright's Locators auto-wait for the
 * element to be actionable before every action, so the explicit-wait plumbing
 * the Selenium base class carried is simply not needed. Page objects hold the
 * Page and expose actions; waiting is handled by the engine.
 */
public abstract class BasePage {

    protected final Page page;

    protected BasePage(Page page) {
        this.page = page;
    }
}
