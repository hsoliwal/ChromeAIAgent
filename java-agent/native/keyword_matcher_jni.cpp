// Optional JNI acceleration for the bounded ASCII keyword matcher.
// This is not a model inference engine and does not load Chrome assets.
#include <jni.h>

namespace {
constexpr jsize MAX_TEXT_CHARS = 1'048'576;
constexpr jsize MAX_PATTERNS = 256;
constexpr jsize MAX_PATTERN_CHARS = 128;
constexpr jlong MAX_CANDIDATE_POSITIONS = 8'388'608;

void fail(JNIEnv* env, const char* type, const char* message) noexcept {
    if (env->ExceptionCheck()) return;
    jclass exception = env->FindClass(type);
    if (exception != nullptr) {
        env->ThrowNew(exception, message);
        env->DeleteLocalRef(exception);
    }
}

// GetStringChars preserves Java's UTF-16 length/validation semantics, including NUL.
class StringChars {
    JNIEnv* env_;
    jstring string_;
    const jchar* chars_;
public:
    StringChars(JNIEnv* env, jstring string) noexcept
        : env_(env), string_(string), chars_(env->GetStringChars(string, nullptr)) { }
    ~StringChars() { if (chars_ != nullptr) env_->ReleaseStringChars(string_, chars_); }
    StringChars(const StringChars&) = delete;
    StringChars& operator=(const StringChars&) = delete;
    const jchar* data() const noexcept { return chars_; }
};

constexpr bool word(jchar c) noexcept {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
        || (c >= '0' && c <= '9') || c == '_';
}

constexpr jchar lower(jchar c) noexcept {
    return c >= 'A' && c <= 'Z' ? static_cast<jchar>(c + ('a' - 'A')) : c;
}

bool validText(const jchar* text, jsize size) noexcept {
    for (jsize i = 0; i < size; ++i) {
        const jchar c = text[i];
        if (c > 126 || (c < 32 && c != '\t' && c != '\r' && c != '\n')) return false;
    }
    return true;
}

bool validPattern(const jchar* pattern, jsize length) noexcept {
    for (jsize i = 0; i < length; ++i) {
        const jchar c = pattern[i];
        if (c >= 'a' && c <= 'z') continue;
        if (c != ' ' || i == 0 || i + 1 == length || pattern[i - 1] == ' ') return false;
    }
    return true;
}

bool matches(const jchar* text, jsize size, const jchar* pattern, jsize length) noexcept {
    if (length > size) return false;
    for (jsize i = 0; i <= size - length; ++i) {
        if ((i != 0 && word(text[i - 1]))
            || (i + length < size && word(text[i + length]))) continue;
        bool matched = true;
        for (jsize j = 0; j < length; ++j) {
            if (lower(text[i + j]) != pattern[j]) {
                matched = false;
                break;
            }
        }
        if (matched) return true;
    }
    return false;
}

bool inspectPattern(JNIEnv* env, jstring patternString, const jchar* text,
                    jsize size, bool search) noexcept {
    const jsize length = env->GetStringLength(patternString);
    if (length == 0 || length > MAX_PATTERN_CHARS) {
        fail(env, "java/lang/IllegalArgumentException", "invalid keyword");
        return false;
    }
    StringChars pattern(env, patternString);
    if (pattern.data() == nullptr) {
        fail(env, "java/lang/OutOfMemoryError", "cannot copy keyword");
        return false;
    }
    if (!validPattern(pattern.data(), length)) {
        fail(env, "java/lang/IllegalArgumentException", "invalid keyword");
        return false;
    }
    return search && matches(text, size, pattern.data(), length);
}
}

extern "C" JNIEXPORT jint JNICALL
Java_io_synexia_chromeagent_NativeKeywordMatcher_firstIndexNative(
    JNIEnv* env, jclass, jstring source, jobjectArray patterns) {
    if (source == nullptr || patterns == nullptr) {
        fail(env, "java/lang/NullPointerException", source == nullptr ? "text" : "candidates");
        return -1;
    }
    const jsize size = env->GetStringLength(source);
    const jsize count = env->GetArrayLength(patterns);
    if (size > MAX_TEXT_CHARS || count > MAX_PATTERNS
        || static_cast<jlong>(size) * count > MAX_CANDIDATE_POSITIONS) {
        fail(env, "java/lang/IllegalArgumentException", "matcher capacity exceeded");
        return -1;
    }
    StringChars text(env, source);
    if (text.data() == nullptr) {
        fail(env, "java/lang/OutOfMemoryError", "cannot copy keyword text");
        return -1;
    }
    if (!validText(text.data(), size)) {
        fail(env, "java/lang/IllegalArgumentException", "non-ASCII text");
        return -1;
    }
    jint found = -1;
    for (jsize i = 0; i < count; ++i) {
        auto patternString = static_cast<jstring>(env->GetObjectArrayElement(patterns, i));
        if (env->ExceptionCheck()) return -1;
        if (patternString == nullptr) {
            fail(env, "java/lang/IllegalArgumentException", "invalid keyword");
            return -1;
        }
        const bool match = inspectPattern(env, patternString, text.data(), size, found == -1);
        env->DeleteLocalRef(patternString);
        if (env->ExceptionCheck()) return -1;
        if (match) found = i;
        // Validate later entries too, even after a match, as the Java contract requires.
    }
    return found;
}
