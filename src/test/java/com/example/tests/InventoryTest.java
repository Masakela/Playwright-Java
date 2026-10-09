package com.example.tests;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import com.example.base.BaseTest;
import com.example.pages.InventoryPage;
import com.example.pages.LoginPage;

/**
 * Inventory tests (Playwright / TestNG). Each test starts logged in — a @BeforeMethod
 * logs in on THIS thread's page. It runs AFTER BaseTest's @BeforeMethod (which creates
 * the context + page); TestNG runs superclass @BeforeMethods before subclass ones.
 *
 * THREAD-SAFETY: with parallel="methods" TestNG reuses ONE test-class instance across
 * threads, so an instance field (e.g. a shared InventoryPage) would be stomped by
 * concurrent methods. Instead each test rebuilds the page object from getPage(), which
 * is ThreadLocal in BaseTest — so every method uses its own thread's page.
 */
public class InventoryTest extends BaseTest {

    private InventoryPage inventory() {
        return new InventoryPage(getPage());
    }

    @BeforeMethod
    public void login() {
        new LoginPage(getPage()).open().loginAs("standard_user", "secret_sauce");
    }

    @Test
    public void inventoryPageLoads() {
        assertTrue(inventory().isLoaded(), "Inventory container should be visible after login");
    }

    @Test
    public void showsAllProducts() {
        assertEquals(inventory().getItemCount(), 6, "SauceDemo lists six demo products");
    }

    @Test
    public void addingItemUpdatesCartBadge() {
        InventoryPage inventory = inventory();
        assertEquals(inventory.getCartCount(), 0, "Cart should start empty");
        inventory.addItemToCart("Sauce Labs Backpack");
        assertEquals(inventory.getCartCount(), 1, "Cart badge should read 1 after adding one item");
    }

    @Test
    public void addingTwoItemsShowsCountTwo() {
        InventoryPage inventory = inventory();
        inventory.addItemToCart("Sauce Labs Backpack");
        inventory.addItemToCart("Sauce Labs Bike Light");
        assertEquals(inventory.getCartCount(), 2, "Cart badge should reflect both items");
    }

    @Test
    public void productNamesPresent() {
        InventoryPage inventory = inventory();
        assertFalse(inventory.getItemNames().isEmpty(), "There should be product names");
        assertTrue(inventory.getItemNames().stream().allMatch(n -> !n.isBlank()),
                "No product name should be blank");
    }
}
