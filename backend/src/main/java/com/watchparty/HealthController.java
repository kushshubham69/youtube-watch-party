
package com.watchparty;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
// it is checking if my code or server is running
@RestController
public class HealthController {

    @GetMapping("/api/health")
    public String health() {
        return "Watch Party backend is running!";
    }
}
