document.addEventListener('DOMContentLoaded', function() {
    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Navbar background change on scroll
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
            navbar.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        } else {
            navbar.style.backgroundColor = 'white';
            navbar.style.boxShadow = 'none';
        }
    });

    // Contact form: posts to the Worker in the background, no page reload
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        const status = contactForm.querySelector('.contact-form-status');
        const submitButton = contactForm.querySelector('button[type="submit"]');
        const sitekey = contactForm.dataset.turnstileSitekey;

        if (sitekey) {
            const holder = contactForm.querySelector('.contact-turnstile');
            const turnstileScript = document.createElement('script');
            turnstileScript.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
            turnstileScript.async = true;
            turnstileScript.onload = () => window.turnstile.render(holder, { sitekey, size: 'flexible' });
            document.head.appendChild(turnstileScript);
        }

        const showStatus = (text, kind) => {
            status.textContent = text;
            status.className = 'contact-form-status mb-0 is-' + kind;
        };

        if (new URLSearchParams(window.location.search).get('sent') === '1') {
            showStatus('Got it. We\'ll read it and come back to you with where we\'d start.', 'success');
        }

        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData);
            data.open = formData.getAll('open');
            if (!data.name || data.name.trim().length < 2) {
                showStatus('Please tell us your name.', 'error');
                contactForm.name.focus();
                return;
            }
            if (!data.phone.trim() && !data.email.trim()) {
                showStatus('Please include a phone number or an email address.', 'error');
                contactForm.phone.focus();
                return;
            }

            submitButton.disabled = true;
            showStatus('Sending\u2026', 'pending');
            try {
                const response = await fetch(contactForm.action, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await response.json().catch(() => ({}));
                if (response.ok && result.ok) {
                    contactForm.reset();
                    if (window.turnstile) window.turnstile.reset();
                    showStatus('Got it. We\'ll read it and come back to you with where we\'d start.', 'success');
                } else {
                    showStatus(result.error || 'Something went wrong. Please call us at 512-360-0599.', 'error');
                }
            } catch (err) {
                showStatus('We couldn\'t reach the server. Please call us at 512-360-0599.', 'error');
            } finally {
                submitButton.disabled = false;
            }
        });
    }

    // Animate elements on scroll
    function animateOnScroll() {
        const elements = document.querySelectorAll('.service-card, .benefit-card, .testimonial-card');
        elements.forEach(element => {
            const elementTop = element.getBoundingClientRect().top;
            const elementBottom = element.getBoundingClientRect().bottom;
            const isVisible = (elementTop < window.innerHeight) && (elementBottom >= 0);
            
            if (isVisible) {
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
            }
        });
    }

    window.addEventListener('scroll', animateOnScroll);
    animateOnScroll(); // Initial check
});
