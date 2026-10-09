package com.example.pages;

import java.util.List;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;

/**
 * InventoryPage — the product list after a successful login (Playwright / Java).
 *
 * SauceDemo uses CSS ids/classes for the grid and the data-test attribute for the
 * add-to-cart buttons, so those are targeted with [data-test='...'] directly (not
 * getByTestId, which defaults to data-testid).
 */
public class InventoryPage extends BasePage {

    private final Locator inventoryContainer;
    private final Locator itemNames;
    private final Locator cartBadge;

    public InventoryPage(Page page) {
        super(page);
        this.inventoryContainer = page.locator("[data-test='inventory-container']");
        this.itemNames = page.locator("[data-test='inventory-item-name']");
        this.cartBadge = page.locator("[data-test='shopping-cart-badge']");
    }

    /** True once the product grid is visible — confirms login landed here. */
    public boolean isLoaded() {
        return inventoryContainer.isVisible();
    }

    public int getItemCount() {
        return itemNames.count();
    }

    public List<String> getItemNames() {
        return itemNames.allTextContents();
    }

    /**
     * Add a product by display name. The button's data-test is derived from the name,
     * e.g. 'Sauce Labs Backpack' -> 'add-to-cart-sauce-labs-backpack'.
     */
    public InventoryPage addItemToCart(String productName) {
        String slug = productName.toLowerCase().replace(" ", "-");
        page.locator("[data-test='add-to-cart-" + slug + "']").click();
        return this;
    }

    /** Cart badge count as int; 0 when the badge isn't present (empty cart). */
    public int getCartCount() {
        if (cartBadge.count() == 0) {
            return 0;
        }
        return Integer.parseInt(cartBadge.textContent().trim());
    }

    /** Exposed for web-first assertions in tests. */
    public Locator container() {
        return inventoryContainer;
    }
}
