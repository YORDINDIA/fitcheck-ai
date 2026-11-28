allprojects {
    repositories {
        google()
        mavenCentral()
    }
    // posthog_flutter 5.11.1 declares posthog-android as [3.25.0,4.0.0]. Newer
    // 3.x releases no longer compile against it (CI failed on 3.77.1). 3.72.10
    // is the last version that built on main. Keep this pin until the plugin
    // is upgraded and its build verified.
    configurations.all {
        resolutionStrategy.force("com.posthog:posthog-android:3.72.10")
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    configurations.configureEach {
        // posthog_flutter 5.11.1 includes incompatible Android SDK 4.0.0 in its range.
        resolutionStrategy.force("com.posthog:posthog-android:3.77.1")
    }

    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
