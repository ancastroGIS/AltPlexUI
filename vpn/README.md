# VPN Configuration

Place your ProtonVPN WireGuard configuration file in this directory.

The linuxserver/wireguard container expects the file at `./vpn/wg0.conf`
(or any `.conf` file — it picks up all configs in this folder).

## Getting the config from ProtonVPN

1. Log in at account.protonvpn.com
2. Downloads → WireGuard configuration
3. Select: Linux → pick a server → Create
4. Save the downloaded file as `vpn/wg0.conf`

The file looks like:

```
[Interface]
PrivateKey = <your private key>
Address = 10.2.0.2/32
DNS = 10.2.0.1

[Peer]
PublicKey = <server public key>
AllowedIPs = 0.0.0.0/0
Endpoint = <server>:51820
```

This file is gitignored because it contains your private key.
