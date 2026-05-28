const std = @import("std");

pub fn build(b: *std.Build) void {
    // Target WebAssembly freestanding
    const target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .freestanding,
    });

    // Standard optimization option (ReleaseSmall is ideal for WebAssembly)
    const optimize = b.standardOptimizeOption(.{
        .preferred_optimize_mode = .ReleaseSmall,
    });

        const lib = b.addExecutable(.{
        .name = "core",
        .root_source_file = b.path("src/core.zig"),
        .target = target,
        .optimize = optimize,
    });

    // Export functions to JS, and disable main entry point
    lib.rdynamic = true;
    lib.entry = .disabled;


    // Place the Wasm output directly into assets/wasm/
    const install_lib = b.addInstallArtifact(lib, .{
        .dest_dir = .{ .override = .{ .custom = "../assets/wasm" } },
    });

    b.getInstallStep().dependOn(&install_lib.step);
}
