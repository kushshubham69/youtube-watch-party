
package com.watchparty;

public class Participant {

    private final String userId;
    private final String username;
    private Role role;

    public Participant(String userId, String username, Role role) {
        this.userId = userId;
        this.username = username;
        this.role = role;
    }

    public String getUserId() {
        return userId;
    }

    public String getUsername() {
        return username;
    }

    public Role getRole() {
        return role;
    }

    public void setRole(Role role) {
        this.role = role;
    }
}
