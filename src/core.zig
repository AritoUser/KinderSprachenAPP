const std = @import("std");

// Random generator state (PCG random generator)
var prng: std.rand.Pcg = std.rand.Pcg.init(0);

/// Initialize the random seed from JS
export fn initSeed(seed: u64) void {
    prng = std.rand.Pcg.init(seed);
}

/// Calculate the level based on experience points (XP)
/// Formula: Level = floor(sqrt(xp / 100)) + 1
/// Example:
///   0 XP -> Level 1
///   100 XP -> Level 2
///   400 XP -> Level 3
///   900 XP -> Level 4
export fn calculateLevel(xp: u32) u32 {
    if (xp == 0) return 1;
    
    // Simple integer square root for freestanding wasm
    var temp = xp / 100;
    var res: u32 = 0;
    var bit = @as(u32, 1) << 30; // The second-to-top bit is set

    // "bit" starts at the highest power of four <= the argument.
    while (bit > temp) {
        bit >>= 2;
    }

    while (bit != 0) {
        if (temp >= res + bit) {
            temp -= res + bit;
            res = (res >> 1) + bit;
        } else {
            res >>= 1;
        }
        bit >>= 2;
    }
    return res + 1;
}

/// Calculate XP required to reach the next level
export fn xpForNextLevel(level: u32) u32 {
    return level * level * 100;
}

/// Calculate XP required for current level
export fn xpForCurrentLevel(level: u32) u32 {
    if (level <= 1) return 0;
    const prev = level - 1;
    return prev * prev * 100;
}

/// Check if the typed spelling matches the expected word
/// Strips articles "der", "die", "das" and does a case-insensitive check.
/// Returns 1 if correct, 0 if incorrect.
/// Because strings in Wasm are passed by pointer and length:
export fn validateSpelling(typed_ptr: [*]const u8, typed_len: usize, expected_ptr: [*]const u8, expected_len: usize) u32 {
    const typed = typed_ptr[0..typed_len];
    const expected = expected_ptr[0..expected_len];

    const clean_typed = stripArticle(typed);
    const clean_expected = stripArticle(expected);

    if (clean_typed.len != clean_expected.len) return 0;

    for (clean_typed, 0..) |c, i| {
        if (toLower(c) != toLower(clean_expected[i])) return 0;
    }

    return 1;
}

fn toLower(c: u8) u8 {
    if (c >= 'A' and c <= 'Z') {
        return c + 32;
    }
    return c;
}

fn stripArticle(s: []const u8) []const u8 {
    var start: usize = 0;
    // Skip leading spaces
    while (start < s.len and s[start] == ' ') : (start += 1) {}
    
    // Check if starts with "der ", "die ", "das " case insensitively
    if (s.len - start > 4) {
        const first4 = s[start .. start + 4];
        const is_der = (toLower(first4[0]) == 'd' and toLower(first4[1]) == 'e' and toLower(first4[2]) == 'r' and first4[3] == ' ');
        const is_die = (toLower(first4[0]) == 'd' and toLower(first4[1]) == 'i' and toLower(first4[2]) == 'e' and first4[3] == ' ');
        const is_das = (toLower(first4[0]) == 'd' and toLower(first4[1]) == 'a' and toLower(first4[2]) == 's' and first4[3] == ' ');
        
        if (is_der or is_die or is_das) {
            return s[start + 4 ..];
        }
    }
    return s[start..];
}

/// Shuffles an array of u32 (e.g. for card shuffling in Memory)
/// Uses Fisher-Yates shuffle
export fn shuffleArray(ptr: [*]u32, len: usize) void {
    if (len <= 1) return;
    const random = prng.random();
    var i: usize = len - 1;
    while (i > 0) : (i -= 1) {
        const j = random.uintLessThan(usize, i + 1);
        const temp = ptr[i];
        ptr[i] = ptr[j];
        ptr[j] = temp;
    }
}

// Shared buffers for JS-to-Wasm string transfer
var typed_buf: [256]u8 = undefined;
var expected_buf: [256]u8 = undefined;
var shuffle_buf: [64]u32 = undefined;

export fn getTypedBufferPointer() [*]u8 {
    return &typed_buf;
}

export fn getExpectedBufferPointer() [*]u8 {
    return &expected_buf;
}

export fn getBufferMaxSize() usize {
    return 256;
}

export fn getShuffleBufferPointer() [*]u32 {
    return &shuffle_buf;
}

export fn getShuffleBufferMaxSize() usize {
    return 64;
}

// Custom Panic Handler for freestanding WebAssembly.
// Intercepts runtime errors and reports them to JavaScript.
extern fn jsPanic(ptr: [*]const u8, len: usize) void;

pub fn panic(msg: []const u8, error_return_trace: ?*std.builtin.StackTrace, ret_addr: ?usize) noreturn {
    _ = error_return_trace;
    _ = ret_addr;
    jsPanic(msg.ptr, msg.len);
    while (true) {
        // Infinite loop to satisfy 'noreturn' in freestanding WebAssembly
    }
}


