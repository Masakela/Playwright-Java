// Jenkins pipeline for the Playwright/Java project.
pipeline {
    agent any
    parameters {
        choice(name: 'BROWSER', choices: ['chromium', 'firefox', 'webkit'], description: 'Browser engine')
    }
    triggers { pollSCM('* * * * *') }
    stages {
        stage('Checkout') { steps { checkout scm } }
        stage('Install browsers') {
            // Playwright for Java downloads browsers via this Maven call.
            steps { bat 'mvn -q compile exec:java -e -D exec.mainClass=com.microsoft.playwright.CLI -D exec.args="install --with-deps"' }
        }
        stage('Test') {
            steps { bat "mvn test -Dbrowser=%BROWSER%" }
        }
    }
    post {
        always {
            junit 'target/surefire-reports/*.xml'
        }
    }
}
