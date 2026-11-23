allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
    configurations.configureEach {
        resolutionStrategy.eachDependency {
            if (requested.group == "com.posthog" && requested.name == "posthog-android") {
                // posthog_flutter 5.11.1 includes incompatible 4.0.0 in its native range.
                useVersion("3.77.1")
                because("Keep the native API compatible with posthog_flutter 5.11.1")
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
