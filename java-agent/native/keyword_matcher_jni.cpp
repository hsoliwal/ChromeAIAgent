// Optional JNI acceleration for the bounded ASCII keyword matcher.
// This is not a model inference engine and does not load Chrome assets.
#include <jni.h>
#include <cstddef>
#include <cstring>

namespace {
constexpr bool word(unsigned char c) noexcept {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
        || (c >= '0' && c <= '9') || c == '_';
}
constexpr unsigned char lower(unsigned char c) noexcept {
    return c >= 'A' && c <= 'Z' ? static_cast<unsigned char>(c + ('a' - 'A')) : c;
}
bool matches(const char* text, std::size_t size, const char* pattern, std::size_t length) noexcept {
    if (length > size) return false;
    for (std::size_t i = 0; i <= size - length; ++i) {
        if ((i != 0 && word(static_cast<unsigned char>(text[i - 1])))
            || (i + length < size && word(static_cast<unsigned char>(text[i + length])))) continue;
        bool matched = true;
        for (std::size_t j = 0; j < length; ++j) {
            if (lower(static_cast<unsigned char>(text[i + j])) != static_cast<unsigned char>(pattern[j])) {
                matched = false;
                break;
            }
        }
        if (matched) return true;
    }
    return false;
}
}

extern "C" JNIEXPORT jint JNICALL
Java_io_synexia_chromeagent_NativeKeywordMatcher_firstIndexNative(
    JNIEnv* env, jclass, jstring source, jobjectArray patterns) {
    if (source == nullptr || patterns == nullptr) return -1; // Java pre-validates.
    const char* text = env->GetStringUTFChars(source, nullptr);
    if (text == nullptr) return -1; // VM has raised OutOfMemoryError.
    const auto size = static_cast<std::size_t>(env->GetStringUTFLength(source));
    const jsize count = env->GetArrayLength(patterns);
    jint found = -1;
    for (jsize i = 0; i < count; ++i) {
        auto patternString = static_cast<jstring>(env->GetObjectArrayElement(patterns, i));
        if (patternString == nullptr) {
            if (env->ExceptionCheck()) break;
            continue;
        }
        const char* pattern = env->GetStringUTFChars(patternString, nullptr);
        if (pattern == nullptr) {
            env->DeleteLocalRef(patternString);
            break;
        }
        auto length = static_cast<std::size_t>(env->GetStringUTFLength(patternString));
        bool match = matches(text, size, pattern, length);
        env->ReleaseStringUTFChars(patternString, pattern);
        env->DeleteLocalRef(patternString);
        if (match) { found = i; break; }
    }
    env->ReleaseStringUTFChars(source, text);
    return found;
}
