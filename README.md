# redge

sudo iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 8443
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8080

cp x-arm.service /etc/systemd/system/

sudo systemctl enable x-arm
sudo systemctl start x-arm
sudo systemctl status x-arm