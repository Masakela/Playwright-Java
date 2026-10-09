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
 * Inventory tests (Playwright / TestNG). Each test starts logged in — a local
 * @BeforeMethod logs in and stores the InventoryPage. It runs AFTER BaseTest's
 * @BeforeMethod (which creates the context + page); TestNG runs superclass
 * @BeforeMethods before subclass ones.
 */
public class InventoryTest extends BaseTest {

    private InventoryPage inventory;

    @BeforeMethod
    public void login() {
        inventory = new LoginPage(getPage()).open().loginAs("standard_user", "secret_sauce");
    }

    @Test
    public void inventoryPageLoads() {
        assertTrue(inventory.isLoaded(), "Inventory container should be visible after login");
    }

    @Test
    public void showsAllProducts() {
        assertEquals(inventory.getItemCount(), 6, "SauceDemo lists six demo products");
    }

    @Test
    public void addingItemUpdatesCartBadge() {
        assertEquals(inventory.getCartCount(), 0, "Cart should start empty");
        inventory.addItemToCart("Sauce Labs Backpack");
        assertEquals(inventory.getCartCount(), 1, "Cart badge should read 1 after adding one item");
    }

    @Test
    public void addingTwoItemsShowsCountTwo() {
        inventory.addItemToCart("Sauce Labs Backpack");
        inventory.addItemToCart("Sauce Labs Bike Light");
        assertEquals(inventory.getCartCount(), 2, "Cart badge should reflect both items");
    }

    @Test
    public void productNamesPresent() {
        assertFalse(inventory.getItemNames().isEmpty(), "There should be product names");
        assertTrue(inventory.getItemNames().stream().allMatch(n -> !n.isBlank()),
                "No product name should be blank");
    }
}
