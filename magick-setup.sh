set -e
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
	echo "Please run this script as root."; exit
fi

# libjpeg
if [ ! -d jpeg-* ]; then
	echo "Downloading libjpeg..."
	wget https://ijg.org/files/jpegsrc.v9e.tar.gz
	tar xzf jpegsrc.v9e.tar.gz
fi
cd jpeg-*
if [ ! -f make.done ]; then
	echo "Installing libjpeg..."
	./configure --enable-shared
	make -j$(nproc)
	make install
	echo "done" > make.done
fi
cd ..

# libde265
if [ ! -d libde265 ]; then
	echo "Downloading libde265..."
	git clone https://github.com/strukturag/libde265
fi
cd libde265
if [ ! -f make.done ]; then
	echo "Installing libde265..."
	./autogen.sh
	./configure
	make -j$(nproc)
	make install
	echo "done" > make.done
fi
cd ..

# libheif
if [ ! -d libheif ]; then
	echo "Downloading libheif..."
	git clone https://github.com/strukturag/libheif
fi
cd libheif
if [ ! -f make.done ]; then
	echo "Installing libheif..."
	./autogen.sh
	./configure --disable-go --disable-examples --disable-dependency-tracking
	make -j$(nproc)
	make install
	echo "done" > make.done
fi
cd ..

# ImageMagick
if [ ! -d ImageMagick-* ]; then
	echo "Downloading ImageMagick..."
	wget https://imagemagick.org/archive/ImageMagick.tar.gz
	tar xzf ImageMagick.tar.gz
fi
cd ImageMagick-*

echo "Installing ImageMagick..."
./configure --with-jpeg --with-heic --without-freetype --without-dps --without-perl
make -j$(nproc)
make install
ldconfig /usr/local/lib

echo "Cleaning up..."
cd ..
rm -r ImageMagick-* ImageMagick.tar.gz
rm -r jpeg-* jpegsrc.v9e.tar.gz libde265 libheif