# Resume Google Play Release Action

![CI](https://github.com/mataku/resume-google-play-release-action/actions/workflows/ci.yml/badge.svg)
![Check dist/](https://github.com/mataku/resume-google-play-release-action/actions/workflows/check-dist.yml/badge.svg)

A GitHub Action to resume a halted Google Play Console release for a specific
track and version.

This action allows you to programmatically resume halted releases in Google Play
Console. It automatically determines whether to set the release status to
`inProgress` (for staged rollouts with `userFraction` set) or `completed` (for
full releases without `userFraction`).

## Features

- Resume halted releases in Google Play Console for specific tracks (production,
  beta, alpha, internal)
- Automatically determines the appropriate status based on `userFraction`:
  - `inProgress` if `userFraction` is set (staged rollout)
  - `completed` if `userFraction` is not set (full release)
- Target releases by version name
- Support for both Service Account and External Account authentication
- Detailed logging for troubleshooting

## Prerequisites

Before using this action, you need to setup using Workload Identity Federation
described in https://github.com/google-github-actions/auth.

Or by using Service Account:

1. Set up Google Play Console API access:
   - Enable the Google Play Android Developer API in your Google Cloud Console
   - Create a service account with appropriate permissions
   - Download the JSON credentials file

2. Grant the service account access to your app in Google Play Console:
   - Go to Google Play Console > Settings > API access
   - Link your Google Cloud project
   - Grant access to the service account with at least "Release to production"
     or "Release to testing tracks" permission

## Usage

### Using Workload Identity Federation (Recommended)

Use `google-github-actions/auth` to authenticate with Workload Identity
Federation. The action will automatically use the
`GOOGLE_APPLICATION_CREDENTIALS` environment variable set by the auth action:

```yaml
steps:
  - name: Authenticate to Google Cloud
    uses: google-github-actions/auth@v3
    with:
      create_credentials_file: true
      workload_identity_provider: ${{ secrets.WORKLOAD_IDENTITY_PROVIDER }}
      service_account: ${{ secrets.GOOGLE_SERVICE_ACCOUNT }}

  - name: Resume Google Play Release
    uses: mataku/resume-google-play-release-action@v1
    with:
      package-name: 'com.example.app'
      version-name: '1.0.0'
      track: 'production'
```

Alternatively, you can explicitly pass the credentials file path:

```yaml
steps:
  - name: Authenticate to Google Cloud
    id: auth
    uses: google-github-actions/auth@v3
    with:
      create_credentials_file: true
      workload_identity_provider: ${{ secrets.WORKLOAD_IDENTITY_PROVIDER }}
      service_account: ${{ secrets.GOOGLE_SERVICE_ACCOUNT }}

  - name: Resume Google Play Release
    uses: mataku/resume-google-play-release-action@v1
    with:
      package-name: 'com.example.app'
      version-name: '1.0.0'
      google-account-json-file-path:
        ${{ steps.auth.outputs.credentials_file_path }}
      track: 'production'
```

### Using Service Account JSON from Secrets

Store your service account JSON as a GitHub secret and pass it directly:

```yaml
steps:
  - name: Resume Google Play Release
    uses: mataku/resume-google-play-release-action@v1
    with:
      package-name: 'com.example.app'
      version-name: '1.0.0'
      google-account-json: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_JSON }}
      track: 'production'
```

### Inputs

| Input                           | Description                                                                                         | Required                               | Default      |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------ |
| `package-name`                  | The package name of the Android application (e.g., `com.example.app`)                               | Yes                                    | -            |
| `version-name`                  | The version name to resume (e.g., `1.0.0`)                                                          | Yes                                    | -            |
| `google-account-json-file-path` | Path to the Google Cloud account JSON file for authentication (service account or external account) | No (if other auth method is available) | -            |
| `google-account-json`           | Google Cloud account JSON content for authentication (service account or external account)          | No (if other auth method is available) | -            |
| `track`                         | The release track to resume (`production`, `beta`, `alpha`, `internal`)                             | Yes                                    | `production` |

**Note**: The action supports three authentication methods with the following
priority:

1. `GOOGLE_APPLICATION_CREDENTIALS` environment variable (automatically set by
   `google-github-actions/auth`)
2. `google-account-json` input parameter
3. `google-account-json-file-path` input parameter

At least one authentication method must be provided.

## Error Handling

The action will fail if:

- No authentication method is provided (`GOOGLE_APPLICATION_CREDENTIALS`,
  `google-account-json-file-path`, or `google-account-json`)
- The specified version name is not found in the track
- Authentication fails
- The Google account doesn't have sufficient permissions
- Network errors occur during API calls

Check the action logs for detailed error messages.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.
