package com.watchparty;

public record ChangeRoleRequest(
        String requesterId,
        String targetUserId,
        Role newRole
) {}