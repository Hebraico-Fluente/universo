-- Pétala & Lucas: presentes no cartão pela InfinitePay da Pétala (InfiniteTag, sem o $). O Pix continua o mesmo.
UPDATE weddings SET infinitepay_tag = 'petala-cavalcanti-silva' WHERE slug = 'petala-e-lucas' AND infinitepay_tag = '';
