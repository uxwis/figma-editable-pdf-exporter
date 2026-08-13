# Editable PDF Exporter Privacy Notice

Effective date: August 13, 2026

Editable PDF Exporter processes the current Figma page and locally installed font data only to create the PDF or handoff package requested by the user.

## Data processing

- The plugin reads top-level frames, visible text layers, text styles, layout information, and compatibility-related effects from the current Figma page.
- When available, the plugin uses the browser Local Font Access API to read matching fonts installed on the user's device. Font data is used only in memory to embed editable text in the generated PDF. If the API is unavailable, the plugin stores only the Figma font name in the PDF as a system-font reference and does not read the font file.
- The plugin does not include or redistribute local font files in handoff packages.

## Collection, storage, and sharing

- No Figma document content, font data, personal data, analytics, or telemetry is collected by the developer.
- No data is uploaded to a server or shared with a third party.
- The plugin has no backend service, user account, authentication, advertising, or payment integration.
- Temporary processing data remains in memory only while the plugin is running and is discarded when the plugin closes.
- Files explicitly exported by the user remain on the user's device and are controlled by the user.

## Network access

The plugin does not make external network requests. Its Figma manifest declares no network access with `allowedDomains: ["none"]`.

## Font licensing

The plugin checks technical font embedding flags where available, but users remain responsible for ensuring that their use and embedding of fonts complies with the applicable font licenses. The plugin does not bypass restricted embedding permissions.

## Changes

Material changes to this notice will be published with an updated effective date.

## Contact

Before publishing, replace this paragraph with the public support email or support URL used in the Figma Community listing:

`TODO: support@example.com`
