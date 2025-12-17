# signalk-to-nmea2000

[![Greenkeeper badge](https://badges.greenkeeper.io/sbender9/signalk-to-nmea2000.svg)](https://greenkeeper.io/)

This is an edit of the standard Signalk Plugin to convert Signal K to NMEA2000.

The original plug-in had a few errors which made some data incompatible with canboat.js (NMEA2000 converter), namely for battery and engine data.

Requires that toChildProcess be set to nmea2000out for the actisense execute provider:

```
     {
      "id": "actisense",
      "pipeElements": [{
        "type": "providers/execute",
        "options": {
          "command": "actisense-serial /dev/ttyUSB0",
          "toChildProcess": "nmea2000out"
        }
      }
```

or you can configure your N2K connection to use canboatjs in the server admin user interface:
![image](https://user-images.githubusercontent.com/1049678/41557237-ac2e2eea-7345-11e8-8719-bbd18ef832cb.png)



Note that if you're using an NGT-1 to transmit AIS, then you need to use their Windows [NMEA Reader](https://www.actisense.com/wp-content/uploads/2017/07/Actisense-NMEA-Reader-v1.517-Setup.exe_.zip) software to add the pgns (129794, 129038, 129041) in the transmitted list. 

Manual installation:

Method 2: Manual Installation via npm link (For Development)

If you are developing a custom add-in or want to install one from a local source that isn't in the Appstore, you can link it manually. 

Open a Command Line Interface: Access the terminal or command prompt for your Signal K server (e.g., via SSH to a Raspberry Pi or using the SignalK-CLI.lnk tool on Windows).

Navigate to the Add-in Directory: Go to the root directory where your custom add-in's code is located.

Create a Local Link: Run npm link in your add-in's directory.

Link to the Server: Navigate to your Signal K server's home directory (often ~/.signalk or a custom install path like c:\signalk).

Establish Connection: Run npm link <plugin-id> (replace <plugin-id> with the name specified in the add-in's package.json file).

Restart Server: Restart the Signal K server.

Configure: The plugin will now appear in the Plugin Config screen in the Admin UI where it can be configured and enabled. 

Note: Manually linked plugins may need to be re-linked if you update or install other plugins via the Appstore. 


Note:

If you are using CerboGX, you must access the command line interface via a ssh terminal. To do this, enable SSH and set a password. To connect via SSH, login as root, with your CerboGX password.

mkdir: signalk-to-nmea2000-ma


