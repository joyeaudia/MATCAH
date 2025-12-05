   // Toggle heart liked state
    document.querySelectorAll('.heart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.toggle('liked');
      });
    });

    // Card selection (single select)
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        // ignore if click was on the heart
        if (e.target.closest('.heart')) return;
        cards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });

      // allow keyboard selection with Enter/Space
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          cards.forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
        }
      });
      
    });