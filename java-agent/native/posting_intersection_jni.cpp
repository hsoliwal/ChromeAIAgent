// Bounded posting intersection. No native process, browser, inference or network access.
#include <jni.h>
#include <algorithm>
#include <memory>
#include <new>

namespace {
constexpr jsize MAX_POSTINGS = 4096;

void fail(JNIEnv* env, const char* type, const char* message) noexcept {
    if (env->ExceptionCheck()) return;
    jclass exception = env->FindClass(type);
    if (exception != nullptr) {
        env->ThrowNew(exception, message);
        env->DeleteLocalRef(exception);
    }
}

bool validPostings(const jint* values, jsize length) noexcept {
    jint previous = -1;
    for (jsize i = 0; i < length; ++i) {
        if (values[i] <= previous) return false;
        previous = values[i];
    }
    return true;
}

jsize intersect(const jint* left, jsize na, const jint* right, jsize nb,
                jint* matched) noexcept {
    jsize i = 0, j = 0, count = 0;
    while (i < na && j < nb) {
        if (left[i] == right[j]) {
            matched[count++] = left[i];
            ++i;
            ++j;
        } else if (left[i] < right[j]) {
            ++i;
        } else {
            ++j;
        }
    }
    return count;
}
}

extern "C" JNIEXPORT jintArray JNICALL
Java_io_synexia_chromeagent_NativePostingIntersection_intersectNative(
    JNIEnv* env, jclass, jintArray first, jintArray second) {
    if (first == nullptr || second == nullptr) {
        fail(env, "java/lang/NullPointerException", "postings");
        return nullptr;
    }
    const jsize na = env->GetArrayLength(first);
    const jsize nb = env->GetArrayLength(second);
    if (na > MAX_POSTINGS || nb > MAX_POSTINGS) {
        fail(env, "java/lang/IllegalArgumentException", "posting capacity exceeded");
        return nullptr;
    }
    if (na == 0 && nb == 0) return env->NewIntArray(0);

    // One bounded allocation: at most 3 * 4096 integers. No C++ allocation
    // exception can escape the JNI boundary, including during memory pressure.
    const jsize capacity = na + nb + std::min(na, nb);
    std::unique_ptr<jint[]> storage(new (std::nothrow) jint[static_cast<std::size_t>(capacity)]);
    if (!storage) {
        fail(env, "java/lang/OutOfMemoryError", "cannot allocate posting snapshots");
        return nullptr;
    }
    jint* left = storage.get();
    jint* right = left + na;
    jint* matched = right + nb;
    if (na > 0) env->GetIntArrayRegion(first, 0, na, left);
    if (env->ExceptionCheck()) return nullptr;
    if (nb > 0) env->GetIntArrayRegion(second, 0, nb, right);
    if (env->ExceptionCheck()) return nullptr;
    // Validate exactly the native snapshots; caller arrays can change after Java validation.
    if (!validPostings(left, na) || !validPostings(right, nb)) {
        fail(env, "java/lang/IllegalArgumentException", "postings must be ascending nonnegative unique IDs");
        return nullptr;
    }
    const jsize count = intersect(left, na, right, nb, matched);
    jintArray out = env->NewIntArray(count);
    if (out != nullptr && count > 0) env->SetIntArrayRegion(out, 0, count, matched);
    return env->ExceptionCheck() ? nullptr : out;
}
