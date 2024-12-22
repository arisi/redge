echo FW VEX
#~/.acme.sh/acme.sh --issue --standalone -d $1 --server letsencrypt
~/.acme.sh/acme.sh --issue -d $1 --server letsencrypt --webroot acme_temp