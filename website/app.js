/* ============================================================
   AI-Nexus Radar — Website Logic
   Interactive dashboard, animations, data display
   ============================================================ */

/* ---------- Background Canvas Animation ---------- */
(function initCanvas() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let mouseX = 0, mouseY = 0;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 1.5 + 0.5;
      this.speedX = (Math.random() - 0.5) * 0.3;
      this.speedY = (Math.random() - 0.5) * 0.3;
      this.opacity = Math.random() * 0.5 + 0.1;
      // Tint: mostly cyan/purple
      const t = Math.random();
      this.color = t < 0.6
        ? `rgba(0, 255, 200, ${this.opacity})`
        : `rgba(139, 92, 246, ${this.opacity})`;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;

      // Mouse interaction
      const dx = mouseX - this.x;
      const dy = mouseY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 150) {
        this.x -= dx * 0.005;
        this.y -= dy * 0.005;
        this.opacity = Math.min(0.8, this.opacity + 0.01);
      }

      if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
        this.reset();
      }
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }

  // Create particles
  const count = Math.min(120, Math.floor((canvas.width * canvas.height) / 12000));
  for (let i = 0; i < count; i++) {
    particles.push(new Particle());
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0, 255, 200, ${0.06 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    drawConnections();
    requestAnimationFrame(animate);
  }

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
  animate();
})();

/* ---------- Scroll Effects ---------- */
(function initScroll() {
  const navbar = document.querySelector('.navbar');

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  });

  // Intersection Observer for active nav links
  const sections = document.querySelectorAll('.section');
  const navLinks = document.querySelectorAll('.nav-link');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, { threshold: 0.3 });

  sections.forEach(s => observer.observe(s));
})();

/* ---------- Job Data ---------- */
// This mirrors the actual scraper output structure.
// In production, this would be fetched from the Bright Data API.
const MOCK_JOBS = [
  {
    company_name: "CityFurnish",
    job_title: "Data Analytics AI Specialist",
    tech_stack_tags: ["Python", "SQL", "AI", "Machine Learning"],
    salary_range: "£60K - £90K GBP",
    posted_date: "3 days ago",
    ai_related: true,
    pulse_tags: ["AI", "Machine Learning"],
  },
  {
    company_name: "Corgi Insurance",
    job_title: "Quantitative Associate",
    tech_stack_tags: ["R", "Go", "PostgreSQL"],
    salary_range: "£100K - £200K GBP",
    posted_date: "2 months",
    ai_related: false,
    pulse_tags: [],
  },
  {
    company_name: "GoSats",
    job_title: "VP, Credit Card Partnerships",
    tech_stack_tags: [],
    salary_range: "",
    posted_date: "1 week ago",
    ai_related: false,
    pulse_tags: [],
  },
  {
    company_name: "Landeed",
    job_title: "Accountant",
    tech_stack_tags: ["Excel", "QuickBooks"],
    salary_range: "",
    posted_date: "5 days ago",
    ai_related: false,
    pulse_tags: [],
  },
  {
    company_name: "SuperKalam",
    job_title: "Finance Manager — Chartered Accountant",
    tech_stack_tags: ["Excel", "Tally"],
    salary_range: "",
    posted_date: "1 month",
    ai_related: false,
    pulse_tags: [],
  },
  {
    company_name: "Laylo",
    job_title: "Head of Finance",
    tech_stack_tags: [],
    salary_range: "",
    posted_date: "2 weeks ago",
    ai_related: false,
    pulse_tags: [],
  },
  {
    company_name: "Neuron Labs",
    job_title: "ML Engineer — LLM Fine-Tuning",
    tech_stack_tags: ["PyTorch", "LoRA", "GPT-4", "Python", "LangChain", "RAG"],
    salary_range: "$180K - $250K USD + equity",
    posted_date: "1 day ago",
    ai_related: true,
    pulse_tags: ["PyTorch", "GPT-4", "LangChain", "RAG"],
  },
];

/* ---------- Render Jobs Table ---------- */
function renderJobs(jobs) {
  const tbody = document.getElementById('jobs-tbody');
  const empty = document.getElementById('jobs-empty');
  const table = document.querySelector('.jobs-table-wrapper');

  if (!jobs || jobs.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
    table.style.display = 'none';
    return;
  }

  table.style.display = 'block';
  empty.style.display = 'none';

  tbody.innerHTML = jobs.map(job => {
    const aiClass = job.ai_related ? 'ai-row' : '';
    const aiFlag = job.ai_related
      ? '<span class="ai-flag yes">🤖 AI</span>'
      : '<span class="ai-flag no">—</span>';
    const tags = job.tech_stack_tags && job.tech_stack_tags.length > 0
      ? job.tech_stack_tags.map(t => {
          const isAi = job.pulse_tags.includes(t);
          return isAi
            ? `<span style="color:var(--accent-cyan);font-weight:600">${t}</span>`
            : `<span>${t}</span>`;
        }).join(', ')
      : '<span class="no-data">—</span>';
    const salary = job.salary_range
      ? `<span class="salary-cell">${job.salary_range}</span>`
      : '<span class="no-data">—</span>';

    return `<tr class="${aiClass}">
      <td class="company-cell">${job.company_name}</td>
      <td>${job.job_title}</td>
      <td>${tags}</td>
      <td>${salary}</td>
      <td style="color:var(--text-muted);font-size:0.8rem">${job.posted_date}</td>
      <td>${aiFlag}</td>
    </tr>`;
  }).join('');
}

/* ---------- Pulse Score Display ---------- */
function animatePulse() {
  const target = 72;
  const el = document.getElementById('pulse-score');
  let current = 0;
  const step = () => {
    current += (target - current) * 0.08;
    if (Math.abs(current - target) < 0.5) {
      current = target;
      el.textContent = Math.round(current);
      return;
    }
    el.textContent = Math.round(current);
    requestAnimationFrame(step);
  };
  step();

  // Level badge
  const level = target >= 70 ? 'HIGH' : target >= 40 ? 'MEDIUM' : 'LOW';
  const levelEl = document.getElementById('pulse-level');
  levelEl.textContent = level;
  levelEl.style.background = level === 'HIGH' ? 'rgba(0,255,200,0.15)' :
                            level === 'MEDIUM' ? 'rgba(245,158,11,0.15)' :
                            'rgba(239,68,68,0.15)';
  levelEl.style.color = level === 'HIGH' ? 'var(--accent-cyan)' :
                        level === 'MEDIUM' ? 'var(--accent-orange)' :
                        'var(--accent-red)';
  levelEl.style.borderColor = level === 'HIGH' ? 'rgba(0,255,200,0.3)' :
                              level === 'MEDIUM' ? 'rgba(245,158,11,0.3)' :
                              'rgba(239,68,68,0.3)';

  // Gauge arc
  const circumference = 534.07;
  const offset = circumference * (1 - target / 100);
  document.getElementById('pulse-arc').style.strokeDashoffset = offset;

  // Meta bars
  document.querySelectorAll('.meta-fill').forEach(el => {
    const w = el.style.width;
    setTimeout(() => { el.style.width = w; }, 300);
  });
}

function animateMetrics() {
  const targets = { ai: 60, salary: 20, freshness: 20 };
  Object.entries(targets).forEach(([key, val]) => {
    const el = document.getElementById(`${key}-val`);
    if (!el) return;
    let current = 0;
    const step = () => {
      current += (val - current) * 0.08;
      if (Math.abs(current - val) < 0.3) {
        el.textContent = val.toFixed(1);
        return;
      }
      el.textContent = current.toFixed(1);
      requestAnimationFrame(step);
    };
    step();
  });
}

/* ---------- Health Monitor Display ---------- */
function renderHealth() {
  const fields = [
    { name: 'Company Name', status: 'healthy' },
    { name: 'Job Title', status: 'healthy' },
    { name: 'Salary Range', status: 'warning' },
    { name: 'Tech Stack Tags', status: 'warning' },
    { name: 'Posted Date', status: 'healthy' },
  ];

  const container = document.getElementById('health-status');
  const detailsEl = container.querySelector('.health-details');
  // Remove the placeholder rows and re-render
  detailsEl.innerHTML = fields.map(f => `
    <div class="health-row">
      <span class="health-field">${f.name}</span>
      <span class="health-status-badge ${f.status}">
        ${f.status === 'healthy' ? '✅ Healthy'
          : f.status === 'warning' ? '⚠️ Needs Attention'
          : '🔴 Critical'}
      </span>
    </div>
  `).join('');

  // Health ring animation
  const healthVal = 80;
  const circumference = 326.73;
  const offset = circumference * (1 - healthVal / 100);
  document.getElementById('health-arc').style.strokeDashoffset = offset;
  document.getElementById('health-score').textContent = healthVal;

  // Recommendation commands
  const recs = [
    {
      field: 'salary_range',
      label: 'Salary Range',
      cmd: 'npx -p @brightdata/cli bdata scraper heal c_msyndhlihcuensmoe "The \\"salary_range\\" field is returning empty values. Fix the scraper to extract any salary, compensation, or pay range mentioned in each job posting." --pretty --json --timeout 600'
    },
    {
      field: 'tech_stack_tags',
      label: 'Tech Stack Tags',
      cmd: 'npx -p @brightdata/cli bdata scraper heal c_msyndhlihcuensmoe "The \\"tech_stack_tags\\" field is returning empty values. Fix the scraper to extract a list of technologies, languages, frameworks, and tools mentioned in each job posting." --pretty --json --timeout 600'
    },
  ];

  const recContainer = document.getElementById('rec-commands');
  recContainer.innerHTML = recs.map((r, i) => `
    <div class="rec-command">
      <span class="rec-num">${i + 1}</span>
      <span>${r.cmd.replace(/\\"/g, '"')}</span>
    </div>
  `).join('');
}

/* ---------- Copy Command ---------- */
function initCopyButton() {
  const btn = document.getElementById('copy-heal-cmd');
  const display = document.getElementById('heal-command-display');

  btn.addEventListener('click', async () => {
    const text = display.textContent;
    try {
      await navigator.clipboard.writeText(text);
      showToast('📋 Heal command copied to clipboard!');
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('📋 Heal command copied!');
    }
  });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

/* ---------- Refresh Jobs (simulated) ---------- */
function initRefresh() {
  const btn = document.getElementById('refresh-jobs');
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.66 4.66A9 9 0 0020.49 15"/></svg> Refreshing...';

    // Simulate API call delay
    setTimeout(() => {
      renderJobs(MOCK_JOBS);
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.66 4.66A9 9 0 0020.49 15"/></svg> Refresh from Collector';
      showToast('📡 Fresh data pulled from collector c_msyndhlihcuensmoe');
    }, 1500);
  });
}

// Spin animation for refresh
const style = document.createElement('style');
style.textContent = `
  .spin {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  renderJobs(MOCK_JOBS);
  animatePulse();
  animateMetrics();
  renderHealth();
  initCopyButton();
  initRefresh();
});
