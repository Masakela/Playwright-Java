package com.example.pages;

import java.util.List;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;

/**
 * InventoryPage — the product list after a successful login (Playwright / Java).
 */
public class InventoryPage extends BasePage {

    private final Locator inventoryContainer;
    private final Locator itemNames;
    private final Locator cartBadge;

    public InventoryPage(Page page) {
        super(page);
        this.inventoryContainer = page.locator("#inventory_container");
        this.itemNames = page.locator(".inventory_item_name");
        this.cartBadge = page.locator(".shopping_cart_badge");
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
     * Add a product by display name. The button test id is derived from the name,
     * e.g. 'Sauce Labs Backpack' -> 'add-to-cart-sauce-labs-backpack'.
     */
    public InventoryPage addItemToCart(String productName) {
        String slug = productName.toLowerCase().replace(" ", "-");
        page.getByTestId("add-to-cart-" + slug).click();
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
