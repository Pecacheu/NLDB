set -e
echo "Installing ImageMagick..."
wget https://imagemagick.org/archive/ImageMagick.tar.gz
tar xvzf ImageMagick.tar.gz
cd ImageMagick-*
./configure --with-jpeg=yes
make
make install
ldconfig /usr/local/lib

cd ..
rm -r ImageMagick-*
rm ImageMagick.tar.gz