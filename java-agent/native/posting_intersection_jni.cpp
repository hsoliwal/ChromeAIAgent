// Bounded posting intersection. No native process, browser, inference or network access.
#include <jni.h>
#include <algorithm>
#include <vector>

extern "C" JNIEXPORT jintArray JNICALL
Java_io_synexia_chromeagent_NativePostingIntersection_intersectNative(
    JNIEnv* env, jclass, jintArray first, jintArray second) {
    if (first == nullptr || second == nullptr) return nullptr; // Java validates.
    const jsize na = env->GetArrayLength(first);
    const jsize nb = env->GetArrayLength(second);
    std::vector<jint> left(static_cast<std::size_t>(na));
    std::vector<jint> right(static_cast<std::size_t>(nb));
    if (na > 0) env->GetIntArrayRegion(first, 0, na, left.data());
    if (env->ExceptionCheck()) return nullptr;
    if (nb > 0) env->GetIntArrayRegion(second, 0, nb, right.data());
    if (env->ExceptionCheck()) return nullptr;
    std::vector<jint> matched;
    matched.reserve(static_cast<std::size_t>(std::min(na, nb)));
    std::size_t i = 0, j = 0;
    while (i < left.size() && j < right.size()) {
        if (left[i] == right[j]) {
            matched.push_back(left[i]);
            ++i;
            ++j;
        } else if (left[i] < right[j]) {
            ++i;
        } else {
            ++j;
        }
    }
    auto out = env->NewIntArray(static_cast<jsize>(matched.size()));
    if (out != nullptr && !matched.empty()) {
        env->SetIntArrayRegion(out, 0, static_cast<jsize>(matched.size()), matched.data());
    }
    return out;
}
