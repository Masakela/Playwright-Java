package com.example.agent;

import com.example.pages.BasePage;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;

/**
 * AgentConsolePage - Page Object for the agent console/chat UI (cheatsheet #1 POM;
 * SDET doc ui/pages). Selectors use getByTestId - the stable, user-model locator
 * the docs mandate (no CSS/XPath).
 */
public class AgentConsolePage extends BasePage {

    private final Locator goalInput;
    private final Locator submit;
    private final Locator response;
    private final Locator status;

    public AgentConsolePage(Page page) {
        super(page);
        this.goalInput = page.getByTestId("agent-goal-input");
        this.submit    = page.getByTestId("agent-submit");
        this.response  = page.getByTestId("agent-response");
        this.status    = page.getByTestId("agent-status");
    }

    public AgentConsolePage open(String baseUrl) {
        page.navigate(baseUrl.replaceAll("/+$", "") + "/agent");
        return this;
    }

    public AgentConsolePage submitGoal(String goal) {
        goalInput.fill(goal);
        submit.click();
        return this;
    }

    public Locator response() { return response; }
    public Locator status()   { return status; }
    public String responseText() { return response.textContent(); }
}
