package com.example.agent;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;

import org.testng.annotations.Test;

import com.example.base.BaseTest;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.RouteFulfillOptions;

/**
 * Network-control pattern (cheatsheet #9 / SDET doc mocking rule): mock the agent
 * API so the console UI can be verified DETERMINISTICALLY, with no live model.
 * We serve a minimal console page and intercept POST /api/agent/run. This runs with
 * only a browser - no agent endpoint needed.
 */
public class AgentMockingTest extends BaseTest {

    @Test(description = "Console renders the mocked agent response")
    public void consoleRendersMockedAgentResponse() throws Exception {
        Page page = getPage();

        String html = Files.readString(Path.of("src/test/resources/agent/agent-console.mock.html"));
        String agentJson =
                "{\"runId\":\"run-xyz\",\"success\":true,\"refused\":false,"
              + "\"message\":\"User created: john@example.com\","
              + "\"actions\":[{\"tool\":\"create_user\",\"args\":{},\"status\":\"ok\"}],"
              + "\"data\":{\"userId\":\"u-100\",\"email\":\"john@example.com\"}}";

        // Serve the console document and mock the agent endpoint.
        page.route("**/agent", route -> route.fulfill(
                new RouteFulfillOptions().setContentType("text/html").setBody(html)));
        page.route("**/api/agent/run", route -> route.fulfill(
                new RouteFulfillOptions().setStatus(200).setContentType("application/json").setBody(agentJson)));

        page.navigate("https://agent.local/agent");
        page.getByTestId("agent-goal-input").fill("create a user for John");
        page.getByTestId("agent-submit").click();

        // Web-first assertions auto-retry until the mocked result renders.
        assertThat(page.getByTestId("agent-response")).containsText("User created: john@example.com");
        assertThat(page.getByTestId("agent-status")).hasText("success");
    }
}
